import { readFile, writeFile } from "node:fs/promises";
import nodemailer from "nodemailer";

const email = "jordi_petsch@icloud.com";
const password = await readHidden("Apple App-spezifisches Passwort: ");

if (!password.trim()) {
  console.error("\nKein Passwort eingegeben. Die Einrichtung wurde abgebrochen.");
  process.exit(1);
}

process.stdout.write("\nVerbindung zu iCloud wird geprüft ... ");
const transport = nodemailer.createTransport({
  host: "smtp.mail.me.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: email, pass: password.trim() }
});

try {
  await transport.verify();
  await transport.sendMail({
    from: { name: "ObjektConnect", address: email },
    to: email,
    subject: "ObjektConnect: iCloud-Mail erfolgreich verbunden",
    text: "Der echte E-Mail-Versand von ObjektConnect ist jetzt aktiv."
  });
} catch (error) {
  console.error("fehlgeschlagen.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const envPath = new URL("../.env", import.meta.url);
let env = await readFile(envPath, "utf8");
env = setEnv(env, "SMTP_HOST", "smtp.mail.me.com");
env = setEnv(env, "SMTP_PORT", "587");
env = setEnv(env, "SMTP_USER", email);
env = setEnv(env, "SMTP_PASSWORD", password.trim());
await writeFile(envPath, env, { mode: 0o600 });

console.log("erfolgreich.");
console.log(`Eine Testmail wurde an ${email} gesendet.`);

function setEnv(source, key, value) {
  const line = `${key}="${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Dieser Befehl muss direkt in einem Terminal ausgeführt werden.");
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    let value = "";
    const onData = (character) => {
      if (character === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(130);
      }
      if (character === "\r" || character === "\n") {
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(value);
        return;
      }
      if (character === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    };
    process.stdin.on("data", onData);
  });
}
