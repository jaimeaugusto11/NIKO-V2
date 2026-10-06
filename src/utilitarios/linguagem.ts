import { addDays, addHours, addMinutes, setDate, addMonths, isValid } from "date-fns";
import { agoraDoNiko, paraISO } from "./datas";

export interface Quando {
  data?: string;
  hora?: string;
  resto: string;
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

export function interpretarQuando(textoOriginal: string): Quando {
  let texto = ` ${textoOriginal} `;
  const comparar = () => semAcento(texto.toLowerCase());
  let data: Date | undefined;
  let hora: string | undefined;
  const base = agoraDoNiko();

  const remover = (regex: RegExp) => {
    const alvo = comparar();
    const achado = regex.exec(alvo);
    if (!achado) return null;
    texto = texto.slice(0, achado.index) + " " + texto.slice(achado.index + achado[0].length);
    return achado;
  };

  const daqui = remover(/\sdaqui\s+(?:a\s+)?(\d{1,3})\s*(minutos?|min|horas?|h|dias?)\s/);
  if (daqui) {
    const n = Number(daqui[1]);
    const unidade = daqui[2];
    const agora = new Date();
    if (unidade.startsWith("min")) {
      const alvo = addMinutes(agora, n);
      data = alvo;
      hora = `${doisDigitos(alvo.getHours())}:${doisDigitos(alvo.getMinutes())}`;
    } else if (unidade.startsWith("h")) {
      const alvo = addHours(agora, n);
      data = alvo;
      hora = `${doisDigitos(alvo.getHours())}:${doisDigitos(alvo.getMinutes())}`;
    } else {
      data = addDays(base, n);
    }
  }

  if (!data && remover(/\sdepois de amanha\s/)) data = addDays(base, 2);
  if (!data && remover(/\samanha\s/)) data = addDays(base, 1);
  if (!data && remover(/\shoje\s/)) data = base;

  if (!data) {
    const barra = remover(/\s(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/);
    if (barra) {
      const ano = barra[3] ? (barra[3].length === 2 ? 2000 + Number(barra[3]) : Number(barra[3])) : base.getFullYear();
      const candidata = new Date(ano, Number(barra[2]) - 1, Number(barra[1]));
      if (isValid(candidata) && candidata.getDate() === Number(barra[1])) data = candidata;
    }
  }

  if (!data) {
    const dia = remover(/\sdia\s+(\d{1,2})\s/);
    if (dia) {
      const n = Number(dia[1]);
      if (n >= 1 && n <= 31) {
        let candidata = setDate(base, n);
        if (candidata < new Date(base.getFullYear(), base.getMonth(), base.getDate())) candidata = setDate(addMonths(base, 1), n);
        data = candidata;
      }
    }
  }

  if (!data) {
    const nomes = Object.keys(DIAS_SEMANA).sort((a, b) => b.length - a.length).join("|");
    const semana = remover(new RegExp(`\\s(?:na\\s+|no\\s+|nesta\\s+|neste\\s+|proxima\\s+|proximo\\s+)?(${nomes})\\s`));
    if (semana) {
      const alvo = DIAS_SEMANA[semana[1]];
      let diferenca = (alvo - base.getDay() + 7) % 7;
      if (diferenca === 0) diferenca = 7;
      data = addDays(base, diferenca);
    }
  }

  if (!hora) {
    const h = remover(/\s(?:as\s+|a\s+partir\s+das\s+)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\s/);
    if (h) {
      const horas = Number(h[1]);
      const minutos = Number(h[2] ?? h[3] ?? 0);
      if (horas < 24 && minutos < 60) {
        hora = `${doisDigitos(horas)}:${doisDigitos(minutos)}`;
        if (!data) {
          const agora = new Date();
          const hojeNaHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), horas, minutos);
          data = hojeNaHora < agora ? addDays(base, 1) : base;
        }
      }
    }
  }

  return {
    data: data ? paraISO(data) : undefined,
    hora,
    resto: texto.replace(/\s+/g, " ").trim(),
  };
}
