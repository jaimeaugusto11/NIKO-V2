import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { analisarXml, painelDe, credenciaisDe, autorizacaoDe } = await servidor.ssrLoadModule("/servidor/aws.ts");

const instancias = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeInstancesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <reservationSet>
    <item>
      <instancesSet>
        <item>
          <instanceId>i-abc</instanceId>
          <instanceType>t3.micro</instanceType>
          <ipAddress>1.2.3.4</ipAddress>
          <privateIpAddress>10.0.0.5</privateIpAddress>
          <instanceState><code>16</code><name>running</name></instanceState>
          <placement><availabilityZone>eu-west-1a</availabilityZone></placement>
          <tagSet><item><key>Name</key><value>web</value></item></tagSet>
        </item>
        <item>
          <instanceId>i-parada</instanceId>
          <instanceType>t3.small</instanceType>
          <privateIpAddress>10.0.0.8</privateIpAddress>
          <instanceState><name>stopped</name></instanceState>
          <placement><availabilityZone>eu-west-1b</availabilityZone></placement>
        </item>
      </instancesSet>
    </item>
  </reservationSet>
</DescribeInstancesResponse>`;

const status = `<DescribeInstanceStatusResponse>
  <instanceStatusSet>
    <item>
      <instanceId>i-abc</instanceId>
      <systemStatus><status>ok</status></systemStatus>
      <instanceStatus><status>impaired</status></instanceStatus>
    </item>
    <item>
      <instanceId>i-parada</instanceId>
      <systemStatus><status>not-applicable</status></systemStatus>
      <instanceStatus><status>not-applicable</status></instanceStatus>
    </item>
  </instanceStatusSet>
</DescribeInstanceStatusResponse>`;

const rds = `<DescribeDBInstancesResponse>
  <DescribeDBInstancesResult>
    <DBInstances>
      <DBInstance>
        <DBInstanceIdentifier>app</DBInstanceIdentifier>
        <DBInstanceStatus>available</DBInstanceStatus>
        <Engine>postgres</Engine>
        <DBInstanceClass>db.t3.micro</DBInstanceClass>
      </DBInstance>
    </DBInstances>
  </DescribeDBInstancesResult>
</DescribeDBInstancesResponse>`;

const elb = `<DescribeLoadBalancersResponse>
  <DescribeLoadBalancersResult>
    <LoadBalancers>
      <member>
        <LoadBalancerName>publico</LoadBalancerName>
        <Type>application</Type>
        <DNSName>publico.elb.amazonaws.com</DNSName>
        <State><Code>active</Code></State>
      </member>
    </LoadBalancers>
  </DescribeLoadBalancersResult>
</DescribeLoadBalancersResponse>`;

const alarmes = `<DescribeAlarmsResponse>
  <DescribeAlarmsResult>
    <MetricAlarms>
      <member>
        <AlarmName>cpu-alta</AlarmName>
        <StateValue>ALARM</StateValue>
        <StateReason>Threshold Crossed</StateReason>
        <Namespace>AWS/EC2</Namespace>
        <StateUpdatedTimestamp>2026-10-06T18:00:00.000Z</StateUpdatedTimestamp>
      </member>
      <member>
        <AlarmName>disco</AlarmName>
        <StateValue>OK</StateValue>
        <StateReason>OK</StateReason>
        <Namespace>AWS/EC2</Namespace>
        <StateUpdatedTimestamp>2026-10-06T12:00:00.000Z</StateUpdatedTimestamp>
      </member>
    </MetricAlarms>
  </DescribeAlarmsResult>
</DescribeAlarmsResponse>`;

test("lê instância, ECS, outros serviços e avisos", () => {
  const painel = painelDe("eu-west-1", "123456789012", {
    instancias,
    status,
    clusters: JSON.stringify({ clusters: [{ clusterName: "prod", status: "ACTIVE", activeServicesCount: 1, runningTasksCount: 1, pendingTasksCount: 0 }] }),
    servicos: [{ cluster: "prod", corpo: JSON.stringify({ services: [{ serviceName: "api", status: "ACTIVE", desiredCount: 2, runningCount: 1, pendingCount: 1, launchType: "FARGATE" }] }) }],
    rds,
    lambda: JSON.stringify({ Functions: [{ FunctionName: "job", Runtime: "nodejs22.x", State: "Active" }] }),
    balanceadores: elb,
    alarmes,
    semPermissao: ["RDS"],
  });
  assert.equal(painel.conta, "123456789012");
  assert.equal(painel.regiao, "eu-west-1");
  assert.deepEqual(painel.instancias.map((i) => [i.nome, i.estado, i.verificacao, i.ip, i.zona]), [
    ["web", "no_ar", "alerta", "1.2.3.4", "eu-west-1a"],
    ["i-parada", "parada", "sem_dados", "10.0.0.8", "eu-west-1b"],
  ]);
  assert.equal(painel.clusters[0].nome, "prod");
  assert.equal(painel.clusters[0].estado, "no_ar");
  assert.equal(painel.servicosEcs[0].estado, "alerta");
  assert.deepEqual(painel.outros.map((s) => [s.tipo, s.nome, s.estado]), [
    ["rds", "app", "no_ar"],
    ["lambda", "job", "no_ar"],
    ["balanceador", "publico", "no_ar"],
  ]);
  assert.ok(painel.avisos.some((a) => a.nome === "cpu-alta" && a.estado === "alarme"));
  assert.ok(painel.avisos.some((a) => a.nome === "web" && a.servico === "EC2"));
  assert.ok(painel.avisos.some((a) => a.nome === "api" && a.servico === "ECS"));
  assert.deepEqual(painel.semPermissao, ["RDS"]);
  assert.deepEqual(analisarXml("<raiz><vazio/></raiz>"), { vazio: "" });
});

test("rejeita credencial mal formada antes de chamar a AWS", () => {
  assert.throws(() => credenciaisDe("{}"), /aws_chave_invalida/);
  assert.throws(() => credenciaisDe(JSON.stringify({ accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "x".repeat(40), region: "europa" })), /aws_regiao_invalida/);
  assert.throws(() => credenciaisDe(JSON.stringify({ accessKeyId: "ASIAIOSFODNN7EXAMPLE", secretAccessKey: "x".repeat(40), region: "eu-west-1" })), /aws_sessao_invalida/);
  const ok = credenciaisDe(JSON.stringify({ accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", region: "eu-south-2" }));
  assert.equal(ok.region, "eu-south-2");
});

test("a assinatura SigV4 bate com o exemplo da AWS", () => {
  const segredo = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";
  const credenciais = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: segredo, region: "us-east-1" };
  const agora = new Date("2015-08-30T12:36:00.000Z");
  const assinado = autorizacaoDe({
    metodo: "GET",
    servico: "service",
    regiao: "us-east-1",
    caminho: "/",
    consulta: { Param2: "value2", Param1: "value1" },
    credenciais,
    agora,
  });
  const hash = (t) => createHash("sha256").update(t, "utf8").digest("hex");
  const hmac = (k, t) => createHmac("sha256", k).update(t, "utf8").digest();
  const canonico = ["GET", "/", "Param1=value1&Param2=value2", "host:service.us-east-1.amazonaws.com", "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "x-amz-date:20150830T123600Z", "", "host;x-amz-content-sha256;x-amz-date", hash("")].join("\n");
  const chave = hmac(hmac(hmac(hmac(`AWS4${segredo}`, "20150830"), "us-east-1"), "service"), "aws4_request");
  const paraAssinar = ["AWS4-HMAC-SHA256", "20150830T123600Z", "20150830/us-east-1/service/aws4_request", hash(canonico)].join("\n");
  const esperada = createHmac("sha256", chave).update(paraAssinar, "utf8").digest("hex");
  assert.match(assinado.cabecalhos.authorization, new RegExp(`Signature=${esperada}$`));
  assert.match(assinado.url, /Param1=value1&Param2=value2/);
});
