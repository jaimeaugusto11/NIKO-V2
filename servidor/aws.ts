import { createHash, createHmac } from "node:crypto";

export interface CredenciaisAws {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

export interface InstanciaAws {
  id: string;
  nome: string;
  estado: "no_ar" | "parada" | "parando" | "iniciando" | "encerrando" | "encerrada";
  tipo: string;
  ip: string;
  zona: string;
  verificacao: "ok" | "alerta" | "insuficiente" | "sem_dados";
}

export interface ClusterAws {
  nome: string;
  estado: string;
  servicos: number;
  pendentes: number;
  rodando: number;
}

export interface ServicoEcsAws {
  nome: string;
  cluster: string;
  estado: string;
  desejadas: number;
  rodando: number;
  pendentes: number;
  tipo: string;
}

export interface OutroServicoAws {
  nome: string;
  tipo: "rds" | "lambda" | "balanceador";
  estado: string;
  detalhe: string;
}

export interface AvisoAws {
  nome: string;
  estado: "ok" | "alarme" | "insuficiente";
  servico: string;
  motivo: string;
  atualizado: string;
}

export interface DadosAws {
  conta: string;
  regiao: string;
  instancias: InstanciaAws[];
  clusters: ClusterAws[];
  servicosEcs: ServicoEcsAws[];
  outros: OutroServicoAws[];
  avisos: AvisoAws[];
  semPermissao: string[];
}

type Valor = string | Valor[] | { [chave: string]: Valor };

const ESTADO_INSTANCIA: Record<string, InstanciaAws["estado"]> = {
  running: "no_ar",
  stopped: "parada",
  stopping: "parando",
  pending: "iniciando",
  "shutting-down": "encerrando",
  terminated: "encerrada",
};

export function credenciaisDe(chave: string): CredenciaisAws {
  let json: Partial<CredenciaisAws>;
  try {
    json = JSON.parse(chave) as Partial<CredenciaisAws>;
  } catch {
    throw new Error("aws_chave_invalida");
  }
  const accessKeyId = String(json.accessKeyId ?? "");
  const secretAccessKey = String(json.secretAccessKey ?? "");
  const region = String(json.region ?? "");
  const sessionToken = json.sessionToken ? String(json.sessionToken) : undefined;
  if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(accessKeyId)) throw new Error("aws_chave_invalida");
  if (secretAccessKey.length < 30) throw new Error("aws_segredo_invalido");
  if (!/^[a-z]{2}(-[a-z0-9]+)+-\d+$/.test(region)) throw new Error("aws_regiao_invalida");
  if (accessKeyId.startsWith("ASIA") && (!sessionToken || sessionToken.length < 16)) throw new Error("aws_sessao_invalida");
  return { accessKeyId, secretAccessKey, region, sessionToken };
}

function hash(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function hmac(chave: Buffer | string, texto: string): Buffer {
  return createHmac("sha256", chave).update(texto, "utf8").digest();
}

function escapar(valor: string): string {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function chaveDeAssinatura(segredo: string, data: string, regiao: string, servico: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${segredo}`, data), regiao), servico), "aws4_request");
}

interface PedidoAws {
  metodo: "GET" | "POST";
  servico: string;
  regiao: string;
  caminho?: string;
  consulta?: Record<string, string>;
  corpo?: string;
  cabecalhos?: Record<string, string>;
  credenciais: CredenciaisAws;
  agora?: Date;
}

export function autorizacaoDe(pedido: PedidoAws): { url: string; cabecalhos: Record<string, string>; corpo?: string } {
  const agora = pedido.agora ?? new Date();
  const amzDate = agora.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const data = amzDate.slice(0, 8);
  const host = `${pedido.servico}.${pedido.regiao}.amazonaws.com`;
  const caminho = pedido.caminho || "/";
  const consulta = Object.entries(pedido.consulta ?? {})
    .map(([k, v]) => [escapar(k), escapar(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const corpo = pedido.corpo ?? "";
  const cabecalhos: Record<string, string> = { host, "x-amz-date": amzDate, "x-amz-content-sha256": hash(corpo) };
  if (pedido.credenciais.sessionToken) cabecalhos["x-amz-security-token"] = pedido.credenciais.sessionToken;
  for (const [nome, valor] of Object.entries(pedido.cabecalhos ?? {})) cabecalhos[nome.toLowerCase()] = valor.trim();
  const nomes = Object.keys(cabecalhos).sort();
  const canonicos = nomes.map((nome) => `${nome}:${cabecalhos[nome].trim().replace(/\s+/g, " ")}\n`).join("");
  const assinados = nomes.join(";");
  const canonico = [pedido.metodo, caminho, consulta, canonicos, assinados, hash(corpo)].join("\n");
  const escopo = `${data}/${pedido.regiao}/${pedido.servico}/aws4_request`;
  const paraAssinar = `AWS4-HMAC-SHA256\n${amzDate}\n${escopo}\n${hash(canonico)}`;
  const assinatura = createHmac("sha256", chaveDeAssinatura(pedido.credenciais.secretAccessKey, data, pedido.regiao, pedido.servico)).update(paraAssinar, "utf8").digest("hex");
  return {
    url: `https://${host}${caminho}${consulta ? `?${consulta}` : ""}`,
    corpo: pedido.metodo === "GET" ? undefined : corpo,
    cabecalhos: { ...cabecalhos, authorization: `AWS4-HMAC-SHA256 Credential=${pedido.credenciais.accessKeyId}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}` },
  };
}

async function pedir(pedido: PedidoAws): Promise<{ status: number; texto: string }> {
  const assinado = autorizacaoDe(pedido);
  const r = await fetch(assinado.url, { method: pedido.metodo, headers: assinado.cabecalhos, body: assinado.corpo, signal: AbortSignal.timeout(20000) });
  return { status: r.status, texto: await r.text() };
}

function erroDe(texto: string): { codigo: string; mensagem: string } | null {
  const codigo = /<Code>([^<]+)<\/Code>/.exec(texto)?.[1] ?? (/\"__type\"\s*:\s*\"([^\"]+)\"/.exec(texto)?.[1] ?? "");
  if (!codigo && texto.trim().startsWith("{")) {
    try {
      const json = JSON.parse(texto) as { message?: string; Message?: string };
      const mensagem = json.message ?? json.Message;
      if (mensagem) return { codigo: "Erro", mensagem };
    } catch {
      return null;
    }
  }
  if (!codigo) return null;
  const mensagem = /<Message>([^<]*)<\/Message>/.exec(texto)?.[1] ?? /\"message\"\s*:\s*\"([^\"]*)\"/.exec(texto)?.[1] ?? codigo;
  return { codigo, mensagem };
}

function credencialRuim(erro: { codigo: string; mensagem: string } | null): boolean {
  return Boolean(erro && /AuthFailure|SignatureDoesNotMatch|InvalidClientTokenId|UnrecognizedClient|ExpiredToken|InvalidSignature/i.test(`${erro.codigo} ${erro.mensagem}`));
}

function semPermissao(status: number, erro: { codigo: string; mensagem: string } | null): boolean {
  if (status === 403) return true;
  return Boolean(erro && /AccessDenied|Unauthorized|not authorized|explicit deny/i.test(`${erro.codigo} ${erro.mensagem}`));
}

async function lerServico(pedido: PedidoAws, nome: string, falhas: string[]): Promise<string> {
  try {
    const r = await pedir(pedido);
    const erro = r.status >= 400 ? erroDe(r.texto) : null;
    if (credencialRuim(erro)) throw new Error("aws_credenciais");
    if (r.status >= 400) {
      falhas.push(semPermissao(r.status, erro) ? nome : `${nome}: ${erro?.mensagem ?? `http_${r.status}`}`);
      return "";
    }
    return r.texto;
  } catch (e) {
    if ((e as Error).message === "aws_credenciais") throw e;
    falhas.push(`${nome}: ${(e as Error).message}`);
    return "";
  }
}

export function analisarXml(xml: string): Valor {
  const s = xml.replace(/^\uFEFF/, "");
  let i = 0;
  const fim = () => i >= s.length;

  function pularEspaco() {
    while (!fim() && /[\s]/.test(s[i])) i += 1;
  }

  function nome() {
    const ini = i;
    while (!fim() && /[\w:._-]/.test(s[i])) i += 1;
    return s.slice(ini, i).replace(/^.*:/, "");
  }

  function ate(marca: string) {
    const pos = s.indexOf(marca, i);
    i = pos < 0 ? s.length : pos + marca.length;
  }

  function decodificar(texto: string) {
    return texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
  }

  function elemento(): { nome: string; valor: Valor } | null {
    pularEspaco();
    if (fim() || s[i] !== "<") return null;
    i += 1;
    if (s.startsWith("?", i) || s.startsWith("!", i)) {
      ate(s.startsWith("!--", i) ? "-->" : ">");
      return elemento();
    }
    const tag = nome();
    while (!fim() && s[i] !== ">" && s[i] !== "/") {
      if (/\s/.test(s[i])) {
        i += 1;
        continue;
      }
      nome();
      if (s[i] === "=") {
        i += 1;
        const aspa = s[i];
        if (aspa === '"' || aspa === "'") {
          i += 1;
          ate(aspa);
        }
      }
    }
    if (s[i] === "/") {
      i += 2;
      return { nome: tag, valor: "" };
    }
    i += 1;
    const partes: { nome: string; valor: Valor }[] = [];
    let texto = "";
    while (!fim()) {
      if (s.startsWith("</", i)) {
        i += 2;
        nome();
        ate(">");
        break;
      }
      if (s[i] === "<") {
        const filho = elemento();
        if (filho) partes.push(filho);
      } else {
        const ini = i;
        while (!fim() && s[i] !== "<") i += 1;
        texto += s.slice(ini, i);
      }
    }
    if (partes.length === 0) return { nome: tag, valor: decodificar(texto) };
    const obj: Record<string, Valor> = {};
    for (const parte of partes) {
      const anterior = obj[parte.nome];
      if (anterior === undefined) obj[parte.nome] = parte.valor;
      else if (Array.isArray(anterior)) anterior.push(parte.valor);
      else obj[parte.nome] = [anterior, parte.valor];
    }
    return { nome: tag, valor: obj };
  }

  pularEspaco();
  return elemento()?.valor ?? {};
}

function objeto(valor: Valor | undefined): Record<string, Valor> | undefined {
  if (!valor || typeof valor === "string" || Array.isArray(valor)) return undefined;
  return valor;
}

function texto(valor: Valor | undefined): string {
  return typeof valor === "string" ? valor : "";
}

function filho(valor: Valor | undefined, ...chaves: string[]): Valor | undefined {
  let atual = valor;
  for (const chave of chaves) {
    const obj = objeto(atual);
    if (!obj) return undefined;
    atual = obj[chave];
  }
  return atual;
}

function itens(valor: Valor | undefined, chave?: string): Record<string, Valor>[] {
  const alvo = chave ? filho(valor, chave) : valor;
  if (!alvo) return [];
  if (Array.isArray(alvo)) return alvo.map(objeto).filter((x): x is Record<string, Valor> => Boolean(x));
  const obj = objeto(alvo);
  if (!obj) return [];
  if ("item" in obj) return itens(obj.item);
  if ("member" in obj) return itens(obj.member);
  return [obj];
}

function jsonDe<T>(textoBruto: string, vazio: T): T {
  if (!textoBruto) return vazio;
  try {
    return JSON.parse(textoBruto) as T;
  } catch {
    return vazio;
  }
}

function verificacaoDe(sistema: string, instancia: string): InstanciaAws["verificacao"] {
  const estados = [sistema, instancia].filter(Boolean);
  if (estados.length === 0) return "sem_dados";
  if (estados.some((e) => e === "impaired" || e === "failed" || e === "insufficient")) return "alerta";
  if (estados.every((e) => e === "ok")) return "ok";
  if (estados.some((e) => e === "insufficient-data" || e === "initializing")) return "insuficiente";
  return "sem_dados";
}

function estadoGenerico(valor: string): string {
  const n = valor.toLowerCase();
  if (["running", "available", "active", "active_healthy", "ok", "in-service"].includes(n)) return "no_ar";
  if (["stopped", "inactive", "out-of-service"].includes(n)) return "parada";
  if (["pending", "starting", "provisioning", "creating", "modifying", "backing-up", "configuring"].includes(n)) return "iniciando";
  if (["failed", "impaired", "error", "deleting"].includes(n)) return "erro";
  return valor || "sem_dados";
}

export function painelDe(regiao: string, conta: string, fontes: { instancias?: string; status?: string; clusters?: string; servicos?: { cluster: string; corpo: string }[]; rds?: string; lambda?: string; balanceadores?: string; alarmes?: string; semPermissao: string[] }): DadosAws {
  const instanciasXml = fontes.instancias ? analisarXml(fontes.instancias) : {};
  const statusXml = fontes.status ? analisarXml(fontes.status) : {};
  const saude = new Map<string, InstanciaAws["verificacao"]>();
  for (const item of itens(filho(statusXml, "instanceStatusSet"))) {
    const id = texto(item.instanceId);
    const sistema = texto(filho(item.systemStatus, "status"));
    const propria = texto(filho(item.instanceStatus, "status"));
    if (id) saude.set(id, verificacaoDe(sistema, propria));
  }
  const instancias: InstanciaAws[] = [];
  for (const reserva of itens(filho(instanciasXml, "reservationSet"))) {
    for (const inst of itens(filho(reserva, "instancesSet"))) {
      const id = texto(inst.instanceId);
      if (!id) continue;
      const tags = itens(filho(inst, "tagSet"));
      const nome = texto(tags.find((t) => texto(t.key) === "Name")?.value) || id;
      const bruto = texto(filho(inst.instanceState, "name"));
      instancias.push({
        id,
        nome,
        estado: ESTADO_INSTANCIA[bruto] ?? "parada",
        tipo: texto(inst.instanceType),
        ip: texto(inst.ipAddress) || texto(inst.privateIpAddress),
        zona: texto(filho(inst.placement, "availabilityZone")),
        verificacao: saude.get(id) ?? "sem_dados",
      });
    }
  }

  const clustersJson = jsonDe<{ clusters?: { clusterName?: string; status?: string; activeServicesCount?: number; runningTasksCount?: number; pendingTasksCount?: number }[] }>(fontes.clusters ?? "", {});
  const clusters: ClusterAws[] = (clustersJson.clusters ?? []).map((c) => ({
    nome: c.clusterName ?? "",
    estado: estadoGenerico(c.status ?? ""),
    servicos: c.activeServicesCount ?? 0,
    pendentes: c.pendingTasksCount ?? 0,
    rodando: c.runningTasksCount ?? 0,
  }));

  const servicosEcs: ServicoEcsAws[] = [];
  for (const lote of fontes.servicos ?? []) {
    const json = jsonDe<{ services?: { serviceName?: string; status?: string; desiredCount?: number; runningCount?: number; pendingCount?: number; launchType?: string; schedulingStrategy?: string }[] }>(lote.corpo, {});
    for (const s of json.services ?? []) {
      const desejadas = s.desiredCount ?? 0;
      const rodando = s.runningCount ?? 0;
      const atras = desejadas > 0 && rodando < desejadas;
      servicosEcs.push({
        nome: s.serviceName ?? "",
        cluster: lote.cluster,
        estado: atras ? "alerta" : estadoGenerico(s.status ?? ""),
        desejadas,
        rodando,
        pendentes: s.pendingCount ?? 0,
        tipo: s.launchType || s.schedulingStrategy || "",
      });
    }
  }

  const rdsXml = fontes.rds ? analisarXml(fontes.rds) : {};
  const outros: OutroServicoAws[] = itens(filho(rdsXml, "DescribeDBInstancesResult", "DBInstances"), "DBInstance").map((db) => ({
    nome: texto(db.DBInstanceIdentifier),
    tipo: "rds" as const,
    estado: estadoGenerico(texto(db.DBInstanceStatus)),
    detalhe: [texto(db.Engine), texto(db.DBInstanceClass)].filter(Boolean).join(" · "),
  }));

  const lambda = jsonDe<{ Functions?: { FunctionName?: string; Runtime?: string; State?: string; LastModified?: string }[] }>(fontes.lambda ?? "", {});
  for (const fn of lambda.Functions ?? []) {
    outros.push({ nome: fn.FunctionName ?? "", tipo: "lambda", estado: estadoGenerico(fn.State || "Active"), detalhe: fn.Runtime ?? "" });
  }

  const elbXml = fontes.balanceadores ? analisarXml(fontes.balanceadores) : {};
  for (const lb of itens(filho(elbXml, "DescribeLoadBalancersResult", "LoadBalancers"))) {
    outros.push({
      nome: texto(lb.LoadBalancerName),
      tipo: "balanceador",
      estado: estadoGenerico(texto(filho(lb.State, "Code"))),
      detalhe: [texto(lb.Type), texto(lb.DNSName)].filter(Boolean).join(" · "),
    });
  }

  const alarmesXml = fontes.alarmes ? analisarXml(fontes.alarmes) : {};
  const avisos: AvisoAws[] = itens(filho(alarmesXml, "DescribeAlarmsResult", "MetricAlarms")).map((a) => {
    const bruto = texto(a.StateValue);
    return {
      nome: texto(a.AlarmName),
      estado: bruto === "ALARM" ? "alarme" : bruto === "INSUFFICIENT_DATA" ? "insuficiente" : "ok",
      servico: texto(a.Namespace),
      motivo: texto(a.StateReason).slice(0, 240),
      atualizado: texto(a.StateUpdatedTimestamp),
    };
  });

  for (const inst of instancias) {
    if (inst.verificacao !== "alerta") continue;
    avisos.push({ nome: inst.nome, estado: "alarme", servico: "EC2", motivo: `Verificação de estado falhou em ${inst.id}`, atualizado: "" });
  }
  for (const servico of servicosEcs) {
    if (servico.estado !== "alerta") continue;
    avisos.push({ nome: servico.nome, estado: "alarme", servico: "ECS", motivo: `${servico.rodando} de ${servico.desejadas} tarefas no ar em ${servico.cluster}`, atualizado: "" });
  }

  return { conta, regiao, instancias, clusters, servicosEcs, outros, avisos, semPermissao: fontes.semPermissao };
}

function formulario(campos: Record<string, string>): string {
  return Object.entries(campos).map(([k, v]) => `${escapar(k)}=${escapar(v)}`).join("&");
}

function consulta(credenciais: CredenciaisAws, servico: string, campos: Record<string, string>): PedidoAws {
  return {
    metodo: "POST",
    servico,
    regiao: credenciais.region,
    corpo: formulario(campos),
    cabecalhos: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
    credenciais,
  };
}

export async function lerAws(chave: string): Promise<DadosAws> {
  const credenciais = credenciaisDe(chave);
  const falhas: string[] = [];
  const identidade = await lerServico(consulta(credenciais, "sts", { Action: "GetCallerIdentity", Version: "2011-06-15" }), "STS", falhas);
  if (!identidade) throw new Error(falhas[0] === "STS" ? "aws_credenciais" : falhas[0] ?? "aws_credenciais");
  const conta = texto(filho(analisarXml(identidade), "GetCallerIdentityResult", "Account"));

  const [instancias, status, clustersBruto, rds, lambda, balanceadores, alarmes] = await Promise.all([
    lerServico(consulta(credenciais, "ec2", { Action: "DescribeInstances", Version: "2016-11-15", MaxResults: "100" }), "EC2", falhas),
    lerServico(consulta(credenciais, "ec2", { Action: "DescribeInstanceStatus", Version: "2016-11-15", IncludeAllInstances: "true", MaxResults: "100" }), "EC2 status", falhas),
    lerServico({ metodo: "POST", servico: "ecs", regiao: credenciais.region, corpo: "{}", cabecalhos: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AmazonEC2ContainerServiceV20141113.ListClusters" }, credenciais }, "ECS", falhas),
    lerServico(consulta(credenciais, "rds", { Action: "DescribeDBInstances", Version: "2014-10-31", MaxRecords: "40" }), "RDS", falhas),
    lerServico({ metodo: "GET", servico: "lambda", regiao: credenciais.region, caminho: "/2015-03-31/functions/", consulta: { MaxItems: "40" }, credenciais }, "Lambda", falhas),
    lerServico(consulta(credenciais, "elasticloadbalancing", { Action: "DescribeLoadBalancers", Version: "2015-12-01", PageSize: "20" }), "Balanceadores", falhas),
    lerServico(consulta(credenciais, "monitoring", { Action: "DescribeAlarms", Version: "2010-08-01", MaxRecords: "50" }), "CloudWatch", falhas),
  ]);

  const lista = jsonDe<{ clusterArns?: string[] }>(clustersBruto, {});
  const arns = (lista.clusterArns ?? []).slice(0, 8);
  const clusters = arns.length
    ? await lerServico(
        { metodo: "POST", servico: "ecs", regiao: credenciais.region, corpo: JSON.stringify({ clusters: arns }), cabecalhos: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AmazonEC2ContainerServiceV20141113.DescribeClusters" }, credenciais },
        "ECS",
        falhas,
      )
    : "";
  const nomes = jsonDe<{ clusters?: { clusterName?: string; clusterArn?: string }[] }>(clusters, {}).clusters ?? [];
  const servicos = (
    await Promise.all(
      nomes.slice(0, 6).map(async (cluster) => {
        const nome = cluster.clusterName || cluster.clusterArn || "";
        const listaServicos = await lerServico(
          { metodo: "POST", servico: "ecs", regiao: credenciais.region, corpo: JSON.stringify({ cluster: cluster.clusterArn ?? nome, maxResults: 20 }), cabecalhos: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AmazonEC2ContainerServiceV20141113.ListServices" }, credenciais },
          "ECS",
          falhas,
        );
        const servicosArns = jsonDe<{ serviceArns?: string[] }>(listaServicos, {}).serviceArns ?? [];
        if (servicosArns.length === 0) return { cluster: nome, corpo: "" };
        const detalhe = await lerServico(
          { metodo: "POST", servico: "ecs", regiao: credenciais.region, corpo: JSON.stringify({ cluster: cluster.clusterArn ?? nome, services: servicosArns.slice(0, 10) }), cabecalhos: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AmazonEC2ContainerServiceV20141113.DescribeServices" }, credenciais },
          "ECS",
          falhas,
        );
        return { cluster: nome, corpo: detalhe };
      }),
    )
  ).filter((s) => s.corpo);

  return painelDe(credenciais.region, conta, { instancias, status, clusters, servicos, rds, lambda, balanceadores, alarmes, semPermissao: falhas });
}
