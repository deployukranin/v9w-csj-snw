/**
 * 🤖 Runner de Geração de Contas v2.1.0
 * Execute em múltiplos dispositivos para processar mais rápido!
 * 
 * 📦 Instalação:
 * npm install playwright @faker-js/faker imap-simple mailparser html-to-text
 * npx playwright install chromium
 * 
 * 🚀 Uso:
 * node runner.js
 * 
 * 🔧 Debug (navegador visível):
 * HEADLESS=false node runner.js
 * 
 * ⚠️ IMPORTANTE: Baixe sempre a versão mais recente do painel admin!
 */

import { chromium } from "playwright";
import { faker } from "@faker-js/faker";
import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { convert as htmlToText } from "html-to-text";
import { randomUUID } from "crypto";

// ═══════════════ CONFIG ═══════════════
const VERSION = "2.1.0";
const API_URL = "https://uzegwtvvyxuiwqyvasih.supabase.co/functions/v1/automation-api";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6ZWd3dHZ2eXh1aXdxeXZhc2loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1ODYwNjgsImV4cCI6MjA4MjE2MjA2OH0.KnB3lH2_gsXhC_hezcmHhRnAAH6lv9CzfEREPM7LQSY";
const RUNNER_ID = `runner-${randomUUID().slice(0, 8)}`;
const HEADLESS = process.env.HEADLESS !== 'false';
const DOMAIN_REFRESH_INTERVAL = 30000; // Atualiza domínios a cada 30 segundos

let EMAIL_DOMAINS = [];
let IMAP_CONFIG = null;
let ACC_PROCESSED = 0;
let ACC_SUCCESS = 0;
let ACC_FAILED = 0;
let lastDomainRefresh = 0;

const TEMPLATES = [
  "https://lovable.dev/dashboard/templates/websites/landing-page/visual-landing-page-1",
  "https://lovable.dev/dashboard/templates/websites/portfolio/architect-portfolio-1",
  "https://lovable.dev/dashboard/templates/websites/portfolio/creative-photographer",
  "https://lovable.dev/dashboard/templates/websites/portfolio/hobby-photographer",
  "https://lovable.dev/dashboard/templates/websites/blog/perspective-lifestyle",
  "https://lovable.dev/dashboard/templates/websites/blog/editorial",
  "https://lovable.dev/dashboard/templates/websites/blog/voyager",
  "https://lovable.dev/dashboard/templates/websites/blog/vesper",
];

const WORDS_1 = ["ana","maria","julia","beatriz","carla","aline","paula","mariana","gabriela","isabela","camila","leticia","fernanda","bruna","lucas","joao","pedro","rafael","bruno","thiago","felipe","gabriel","marcelo","ricardo","fernando","rodrigo","daniel","leonardo","victor","carlos","marcos","matheus","eduardo","henrique","gustavo"];
const WORDS_2 = ["silva","santos","oliveira","pereira","costa","rodrigues","alves","lima","gomes","ribeiro","martins","araujo","souza","teixeira","barbosa","freitas","melo","ferreira","carvalho","pires","nascimento","moreira","machado","batista","farias","cunha","rocha","moura","azevedo"];

// ═══════════════ HELPERS ═══════════════
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);

function gerarSenha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz!@#$%23456789";
  let s = "";
  while (s.length < 10) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function gerarEmail(domain) {
  const w1 = faker.helpers.arrayElement(WORDS_1);
  const w2 = faker.helpers.arrayElement(WORDS_2);
  const n = faker.number.int({ min: 1, max: 99 });
  return `${w1}_${w2}${n}@${domain}`;
}

function gerarFingerprint() {
  const w = faker.helpers.arrayElement([1280, 1366, 1440, 1536, 1600]);
  const h = faker.helpers.arrayElement([720, 768, 800, 900, 1024]);
  return {
    userAgent: faker.internet.userAgent(),
    viewport: { width: w, height: h },
    deviceScaleFactor: faker.helpers.arrayElement([1, 1.25, 1.5, 2]),
    isMobile: false,
    hasTouch: false,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  };
}

function converterLink(url) {
  if (url.includes("/invite/")) {
    return `https://lovable.dev/signup?referral_code=${url.split("/invite/")[1].trim()}`;
  }
  return url;
}

// ═══════════════ ATUALIZAR DOMÍNIOS ═══════════════
async function atualizarDominios(forcar = false) {
  const agora = Date.now();
  if (!forcar && agora - lastDomainRefresh < DOMAIN_REFRESH_INTERVAL) {
    return EMAIL_DOMAINS.length > 0;
  }
  
  try {
    const r = await api("email-domains");
    if (r.domains?.length > 0) {
      const novos = r.domains.map(d => d.trim().toLowerCase());
      const mudou = JSON.stringify(novos) !== JSON.stringify(EMAIL_DOMAINS);
      
      if (mudou) {
        EMAIL_DOMAINS = novos;
        log(`🔄 Domínios atualizados: ${EMAIL_DOMAINS.join(", ")}`);
      }
      lastDomainRefresh = agora;
      return true;
    } else {
      log(`⚠️ Nenhum domínio ativo no servidor!`);
      EMAIL_DOMAINS = [];
      return false;
    }
  } catch (e) {
    log(`❌ Erro ao atualizar domínios: ${e.message}`);
    return EMAIL_DOMAINS.length > 0;
  }
}

// ═══════════════ API ═══════════════
async function api(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-runner-id": RUNNER_ID,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}/${endpoint}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function claimSlots(count) {
  // O servidor agora gera as credenciais com os domínios CORRETOS do dono do job
  // Isso garante que domínios privados sejam usados exclusivamente pelo dono
  return await api("claim-slots", "POST", { count });
}

// ═══════════════ IMAP ═══════════════
function extractTo(headers) {
  const addrs = [];
  for (const h of ["to", "To", "envelope-to", "x-original-to", "delivered-to"]) {
    const val = headers?.[h];
    if (!val) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") addrs.push(item.toLowerCase());
        else if (item?.address) addrs.push(item.address.toLowerCase());
      }
    } else if (typeof val === "string") addrs.push(val.toLowerCase());
    else if (val?.address) addrs.push(val.address.toLowerCase());
  }
  return addrs.filter(a => a.includes("@"));
}

async function buscarVerificacao(emailPrefix, timeout = 300000) {
  const start = Date.now();
  let conn;
  try {
    conn = await imaps.connect({ imap: IMAP_CONFIG });
    while (Date.now() - start < timeout) {
      for (const folder of ["INBOX", "INBOX.Junk"]) {
        try {
          await conn.openBox(folder, false);
          const results = await conn.search([["SINCE", new Date(Date.now() - 600000)]], { bodies: ["HEADER", "TEXT"], markSeen: false });
          for (const r of results) {
            const hdr = r.parts.find(p => p.which === "HEADER");
            const txt = r.parts.find(p => p.which === "TEXT");
            if (!txt) continue;
            const mail = await simpleParser(txt.body);
            const body = mail.text || (mail.html ? htmlToText(mail.html, { wordwrap: false }) : "");
            const tos = extractTo(hdr?.body);
            const delivered = hdr?.body?.["delivered-to"]?.[0]?.toLowerCase() || "";
            if (!delivered.startsWith(emailPrefix.toLowerCase()) && !tos.some(a => a.startsWith(emailPrefix.toLowerCase()))) continue;
            const match = body.match(/https:\/\/lovable\.dev\/auth\/action[^\s"'<>]*/);
            if (match) {
              await conn.addFlags(r.attributes.uid, ["\\Seen", "\\Deleted"]);
              await conn.imap.expunge();
              return match[0];
            }
          }
        } catch {}
      }
      await sleep(5000);
    }
  } catch (e) {
    log(`❌ Erro IMAP: ${e.message}`);
  } finally {
    if (conn) try { conn.end(); } catch {}
  }
  return null;
}

// ═══════════════ DETECTAR PÁGINA ═══════════════
async function detectCurrentPage(page) {
  const url = page.url();
  
  // Se está em auth/action ou verify-email, ainda processando
  if (url.includes('/auth/action') || url.includes('/verify-email')) {
    return 'verifying';
  }
  
  // Verificar se está no dashboard
  if (url.includes('/dashboard') || url.includes('/projects')) {
    return 'dashboard';
  }
  
  // Verificar se está no onboarding (tem campo de nome)
  try {
    const nameSelectors = ["input[name='fullName']", "input[name='name']", "input[placeholder*='name' i]"];
    for (const sel of nameSelectors) {
      const hasName = await page.locator(sel).isVisible({ timeout: 1500 }).catch(() => false);
      if (hasName) return 'onboarding';
    }
  } catch {}
  
  // Verificar se está na página de login (tem email + password)
  try {
    const hasEmail = await page.locator("input[type='email']").isVisible({ timeout: 1500 }).catch(() => false);
    const hasPassword = await page.locator("input[type='password']").isVisible({ timeout: 1000 }).catch(() => false);
    if (hasEmail && hasPassword && !url.includes('/onboarding') && !url.includes('/signup')) {
      return 'login';
    }
  } catch {}
  
  return 'unknown';
}

// ═══════════════ PROCESSAR CONTA ═══════════════
async function processarConta(slot) {
  const { accountId, jobId, slotNumber, totalSlots, inviteLink, email, password } = slot;
  const prefix = email.split("@")[0];
  let browser;

  try {
    log(`\n🔷 ════════════════════════════════════════`);
    log(`📝 Conta #${slotNumber} de ${totalSlots}`);
    log(`📧 Email: ${email}`);
    log(`🔗 Link: ${inviteLink}`);
    log(`🔷 ════════════════════════════════════════\n`);

    log(`🚀 Iniciando navegador...`);
    browser = await chromium.launch({
      headless: HEADLESS,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    const ctx = await browser.newContext(gerarFingerprint());
    const page = await ctx.newPage();

    log(`🌐 Abrindo página de registro...`);
    await page.goto(converterLink(inviteLink), { waitUntil: "load" });
    await sleep(1500);

    log(`✏️ Preenchendo email...`);
    await page.fill("input[type='email']", email);
    await page.click("div.flex-grow button");
    await sleep(1000);

    log(`🔐 Preenchendo senha...`);
    await page.fill("input[type='password']", password);
    await page.click("div.flex-grow button");

    log(`📬 Aguardando email de verificação...`);
    const link = await buscarVerificacao(prefix);
    if (!link) throw new Error("Email não chegou");

    log(`✅ Email recebido! Verificando...`);
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 120000 });
    await sleep(3000);
    
    // Detectar página atual
    let currentPage = await detectCurrentPage(page);
    log(`📍 Página detectada: ${currentPage} (URL: ${page.url()})`);
    
    // Se caiu na página de login, fazer login
    if (currentPage === 'login') {
      log(`🔐 Detectada página de login, fazendo login com credenciais...`);
      try {
        await page.fill("input[type='email']", email);
        await sleep(500);
        await page.fill("input[type='password']", password);
        await sleep(500);
        
        // Clicar no botão de login
        const loginBtns = ["button[type='submit']", "button:has-text('Entrar')", "button:has-text('Login')", "button:has-text('Sign in')"];
        for (const btn of loginBtns) {
          try {
            const loginBtn = page.locator(btn).first();
            if (await loginBtn.isVisible({ timeout: 2000 })) {
              await loginBtn.click();
              log(`✅ Clicou em ${btn}`);
              break;
            }
          } catch {}
        }
        await sleep(3000);
        currentPage = await detectCurrentPage(page);
        log(`📍 Após login: ${currentPage} (URL: ${page.url()})`);
      } catch (loginErr) {
        log(`⚠️ Erro no login: ${loginErr.message}`);
      }
    }
    
    // Aguardar sair da página de verificação
    let attempts = 0;
    while (currentPage === 'verifying' || page.url() === "https://lovable.dev/") {
      await sleep(2000);
      attempts++;
      currentPage = await detectCurrentPage(page);
      if (attempts > 15) {
        log(`⚠️ Timeout aguardando verificação, tentando dashboard...`);
        await page.goto("https://lovable.dev/dashboard", { waitUntil: "load" });
        await sleep(2000);
        break;
      }
    }
    
    // Se já está no dashboard, pular onboarding
    if (currentPage === 'dashboard') {
      log(`📊 Já no dashboard, pulando onboarding...`);
    } else {
      // Next button (se existir)
      try {
        await page.waitForSelector("button:has-text('Next')", { timeout: 5000 });
        await page.click("button:has-text('Next')");
        log(`➡️ Clicou Next`);
        await sleep(1000);
      } catch {}

      log(`👤 Preenchendo nome...`);
      const nameSelectors = ["input[name='fullName']", "input[name='name']", "input[placeholder*='name' i]"];
      let nameFieldFound = false;
      for (const sel of nameSelectors) {
        try {
          const field = page.locator(sel).first();
          if (await field.isVisible({ timeout: 3000 })) {
            await field.fill(faker.person.fullName());
            nameFieldFound = true;
            log(`✅ Nome preenchido usando: ${sel}`);
            break;
          }
        } catch {}
      }
      if (!nameFieldFound) {
        log(`⚠️ Campo de nome não encontrado, tentando continuar...`);
      }
      
      try {
        await page.click("button:has-text('Next')");
        await sleep(1000);
      } catch {}

      log(`💼 Selecionando cargo...`);
      const role = faker.helpers.arrayElement(["Founder", "Product", "Designer", "Engineer", "Consultant", "Marketing / Sales", "Operations", "Other"]);
      try {
        await page.click(`button:has-text('${role}')`);
        await sleep(1000);
      } catch {}

      log(`👥 Selecionando tamanho da equipe...`);
      const team = faker.helpers.arrayElement(["Solo", "2 - 20", "21 - 200", "200+"]);
      try {
        await page.click(`button:has-text('${team}')`);
        await sleep(1000);
      } catch {}

      // Continue (se existir)
      try {
        const btn = page.locator("button:has-text('Continue')");
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          log(`➡️ Clicou Continue`);
          await sleep(1000);
        }
      } catch {}
    }

    log(`🎨 Selecionando template...`);
    await page.goto(faker.helpers.arrayElement(TEMPLATES));
    await page.click("button:has-text('Use Template')");
    await sleep(1000);
    await page.click("button:has-text('Remix')");
    await sleep(2000);

    log(`📤 Publicando projeto...`);
    await page.locator("#publish-menu").click({ force: true });
    await sleep(1000);
    await page.locator("div[data-state='open'] button:has-text('Publish')").click({ force: true });

    log(`⏳ Aguardando publicação...`);
    await page.waitForSelector("a.flex.flex-1.items-center.gap-1.text-sm.text-foreground.no-underline.hover\\:underline", { timeout: 120000 });

    await browser.close();
    await api("complete-slot", "POST", { accountId, success: true });

    ACC_PROCESSED++;
    ACC_SUCCESS++;

    log(`\n🎉 ════════════════════════════════════════`);
    log(`✅ CONTA #${slotNumber} CRIADA COM SUCESSO!`);
    log(`📧 ${email}`);
    log(`🔑 ${password}`);
    log(`🎉 ════════════════════════════════════════\n`);

    return true;
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    await api("complete-slot", "POST", { accountId, success: false, errorMessage: err.message });
    ACC_PROCESSED++;
    ACC_FAILED++;

    log(`\n💥 ════════════════════════════════════════`);
    log(`❌ FALHA NA CONTA #${slotNumber}`);
    log(`📧 ${email}`);
    log(`💬 ${err.message}`);
    log(`💥 ════════════════════════════════════════\n`);

    return false;
  }
}

// ═══════════════ MAIN ═══════════════
async function main() {
  console.log(`\n`);
  console.log(`╔═══════════════════════════════════════════════════╗`);
  console.log(`║  🤖 RUNNER DE GERAÇÃO DE CONTAS v${VERSION.padEnd(17)}║`);
  console.log(`╠═══════════════════════════════════════════════════╣`);
  console.log(`║  📍 ID: ${RUNNER_ID.padEnd(38)}║`);
  console.log(`║  👁️ Modo: ${(HEADLESS ? "Headless" : "Navegador Visível").padEnd(36)}║`);
  console.log(`║  🔄 Refresh: Domínios atualizados a cada 30s       ║`);
  console.log(`╚═══════════════════════════════════════════════════╝`);
  console.log(`\n`);

  log(`🌐 Buscando domínios ativos...`);
  const temDominios = await atualizarDominios(true);
  if (!temDominios) {
    log(`❌ Nenhum domínio ativo! Configure no painel admin.`);
    log(`⏳ O runner vai tentar novamente em 30 segundos...\n`);
  } else {
    log(`✅ ${EMAIL_DOMAINS.length} domínio(s) ativo(s): ${EMAIL_DOMAINS.join(", ")}`);
  }

  log(`📧 Buscando configuração IMAP...`);
  const imap = await api("imap-config");
  if (!imap.user || !imap.password || !imap.host) {
    log(`❌ Configuração IMAP incompleta!`);
    process.exit(1);
  }
  IMAP_CONFIG = { user: imap.user, password: imap.password, host: imap.host, port: 993, tls: true, authTimeout: 15000 };
  log(`✅ IMAP configurado: ${imap.user}\n`);

// Heartbeat com domínio atual
  const enviarHeartbeat = () => {
    const currentDomain = EMAIL_DOMAINS.length > 0 ? EMAIL_DOMAINS[0] : null;
    api("heartbeat", "POST", { 
      accountsProcessed: ACC_PROCESSED, 
      accountsSuccess: ACC_SUCCESS, 
      accountsFailed: ACC_FAILED,
      currentDomain: currentDomain
    }).catch(() => {});
  };
  
  await enviarHeartbeat();
  setInterval(enviarHeartbeat, 10000);

  // Atualiza domínios periodicamente em background
  setInterval(() => atualizarDominios(), DOMAIN_REFRESH_INTERVAL);
  
  // Checa comandos do servidor (ex: force-refresh)
  setInterval(async () => {
    try {
      const cmds = await api("runner-commands");
      if (cmds?.commands?.length > 0) {
        for (const cmd of cmds.commands) {
          if (cmd.command === 'force-refresh-domains') {
            log(`📡 Comando recebido: Forçar refresh de domínios!`);
            await atualizarDominios(true);
          }
        }
      }
    } catch {}
  }, 5000);

  log(`⏳ Aguardando trabalhos...\n`);

  while (true) {
    try {
      // Checa pause
      const status = await api("runner-status");
      if (status?.paused) {
        log(`⏸️ Runner pausado, aguardando...`);
        await sleep(5000);
        continue;
      }

      // Verifica se tem domínios antes de tentar
      if (EMAIL_DOMAINS.length === 0) {
        log(`⏳ Sem domínios ativos, aguardando...`);
        await sleep(5000);
        continue;
      }

      const result = await claimSlots(10);
      if (result.slots?.length > 0) {
        log(`\n🎯 ${result.slots.length} conta(s) para processar!\n`);
        
        const results = await Promise.allSettled(result.slots.map(s => processarConta(s)));
        const ok = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const fail = results.length - ok;

        log(`\n📊 Lote finalizado: ✅ ${ok} sucesso | ❌ ${fail} falha(s)\n`);
      } else {
        await sleep(3000);
      }
    } catch (e) {
      log(`❌ Erro: ${e.message}`);
      await sleep(5000);
    }
  }
}

main().catch(console.error);