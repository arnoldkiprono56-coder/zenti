const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","guerrillamail.net","guerrillamail.org",
  "guerrillamail.de","guerrillamail.info","guerrillamail.biz","spam4.me",
  "tempmail.com","temp-mail.org","temp-mail.io","throwam.com","throwam.net",
  "yopmail.com","yopmail.fr","cool.fr.nf","jetable.fr.nf","nospam.ze.tc",
  "nomail.xl.cx","mega.zik.dj","speed.1s.fr","courriel.fr.nf","moncourrier.fr.nf",
  "monemail.fr.nf","monmail.fr.nf","trashmail.com","trashmail.at","trashmail.io",
  "trashmail.me","trashmail.net","dispostable.com","mailnull.com","spamgourmet.com",
  "spamgourmet.net","spamgourmet.org","maildrop.cc","sharklasers.com","guerrillamailblock.com",
  "grr.la","guerrillamail.info","spam4.me","trashmail.de","discard.email",
  "fakeinbox.com","mailnesia.com","mailnull.com","nowmymail.com","safetymail.info",
  "spamfree24.org","spamspot.com","spamthisplease.com","stuffmail.de","supermailer.jp",
  "suremail.info","tempe-mail.com","tempr.email","trbvm.com","turual.com",
  "uggsrock.com","uroid.com","veryrealemail.com","viditag.com","viewcastmedia.com",
  "viewcastmedia.net","viewcastmedia.org","wetrainbayarea.com","wetrainbayarea.org",
  "wilemail.com","wpg.im","wwwnew.eu","xagloo.com","xemaps.com","xents.com",
  "xmaily.com","xoxy.net","xzsok.com","yuurok.com","z1p.biz","za.com",
  "zippymail.info","zoaxe.com","zoemail.net","zoemail.org","zomg.info","zxcv.com",
  "10minutemail.com","10minutemail.net","10minutemail.org","10minutemail.co.uk",
  "10minutemail.us","10minutemail.eu","10minutemail.de","10minutemail.co.za",
  "20minutemail.com","20minutemail.it","4warding.com","4warding.net","4warding.org",
  "bobmail.info","bofthew.com","brefmail.com","buffemail.com","byebyemail.com",
  "chiphell.com","chong-mail.com","chong-mail.net","chong-mail.org",
  "deadaddress.com","deadletter.ga","despam.it","dgame.info","digitalsanctuary.com",
  "dingbone.com","discard.email","discardmail.com","discardmail.de","dispostable.com",
  "dm.w3internet.co.uk","dodgeit.com","dodgemail.de","dodgit.com","dodgit.org",
  "doiea.com","domozmail.com","donemail.ru","dontreg.com","dontsendmespam.de",
  "drdrb.com","drdrb.net","e4ward.com","email60.com","emaildrop.io","emailage.cf",
  "emailias.com","emailinfive.com","emailmiser.com","emailproxsy.com","emailsensei.com",
  "emailtemporanea.com","emailtemporanea.net","emailtemporario.com.br","emailthe.net",
  "emailtmp.com","emailwarden.com","emailx.at.hm","emailxfer.com","emailz.cf",
  "emailz.ga","emailz.gq","emailz.ml","emeil.in","emeil.ir","emz.net",
  "enterto.com","ephemail.net","etranquil.com","etranquil.net","etranquil.org",
  "explodemail.com","eyepaste.com","fakemailz.com","fakedemail.com",
  "0815.ru","0clickemail.com","0wnd.net","0wnd.org","10mail.org","123-m.com",
  "1fsdfdsfsdf.tk","1pad.de","20mail.eu","21cn.com","2fdgdfgdfgdf.tk",
  "2prong.com","3d-painting.com","3l6.com","3mail.ga",
]);

/**
 * Normalizes an email address by removing dots and plus-aliases for Gmail/Outlook.
 * This prevents users from creating multiple accounts with "user+1@gmail.com", "u.s.e.r@gmail.com", etc.
 */
export function normalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return email.toLowerCase();

  // Common providers that support aliasing/dot-ignoring
  const providersWithDots = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "icloud.com"];
  
  let normalizedLocal = local;
  
  // 1. Remove plus-aliases (e.g., user+alias@gmail.com -> user@gmail.com)
  normalizedLocal = normalizedLocal.split("+")[0];

  // 2. Remove dots for specific providers
  if (providersWithDots.includes(domain)) {
    normalizedLocal = normalizedLocal.replace(/\./g, "");
  }

  return `${normalizedLocal}@${domain}`;
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  
  // Block common patterns
  if (domain.endsWith(".net") && domain.length > 15) return true; // generic long .net domains
  if (domain.includes("temp") || domain.includes("throw") || domain.includes("mailinator")) return true;

  return DISPOSABLE_DOMAINS.has(domain);
}
