// index.js — Servidor de envio de notificações FCM (corrigido e otimizado)

const admin = require("firebase-admin");
const path = require("path");

// Caminho da chave privada (serviceAccountKey.json)
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://teste-b4489-default-rtdb.firebaseio.com",
});

const db = admin.database();
const messaging = admin.messaging();

console.log("📡 Monitorando novas ordens de serviço...");

// Guardar IDs de OS já notificadas (evita duplicação em memória)
const notificadas = new Set();

/**
 * 🔔 Escuta apenas novas OS (não dispara em updates ou leitura completa)
 * Cada OS adicionada chama essa função uma única vez.
 */
db.ref("dados/ordensServico").on("child_added", async (snapshot) => {
  const os = snapshot.val();
  if (!os || !os.id) return;

  // Evita reenvio se já foi notificada ou marcada no banco
  if (notificadas.has(os.id) || os.notificada) {
    console.log(`⚠️ OS ${os.id} já notificada, ignorando...`);
    return;
  }

  console.log("\n🆕 Nova OS detectada:", os.titulo || `ID ${os.id}`);

  // Envia notificação ao técnico designado
  await enviarNotificacaoSeForParaOTecnico(os);

  // Marca como notificada localmente e no banco
  notificadas.add(os.id);
  await db.ref(`dados/ordensServico/${os.id}`).update({ notificada: true });
});

/**
 * 🔧 Envia a notificação push somente para o técnico responsável pela OS
 */
async function enviarNotificacaoSeForParaOTecnico(os) {
  try {
    if (!os.tecnicoId) {
      console.log("⚠️ OS sem técnicoId, ignorando...");
      return;
    }

    // 🔍 Buscar técnico correspondente
    const tecnicosSnap = await db.ref("dados/tecnicos").once("value");
    const tecnicos = tecnicosSnap.val() || {};
    const tecnico = Array.isArray(tecnicos)
      ? tecnicos.find((t) => t.id === os.tecnicoId)
      : Object.values(tecnicos).find((t) => String(t.id) === String(os.tecnicoId));

    if (!tecnico) {
      console.log("⚠️ Técnico não encontrado para ID:", os.tecnicoId);
      return;
    }

    console.log("👷 Técnico responsável:", tecnico.usuario);

    // 🔍 Buscar usuário vinculado ao técnico
    const usuariosSnap = await db.ref("dados/usuarios").once("value");
    const usuarios = usuariosSnap.val() || {};
    const usuario = Array.isArray(usuarios)
      ? usuarios.find((u) => u.usuario === tecnico.usuario)
      : Object.values(usuarios).find((u) => u.usuario === tecnico.usuario);

    if (!usuario) {
      console.log("⚠️ Usuário vinculado ao técnico não encontrado:", tecnico.usuario);
      return;
    }

    if (!usuario.tokenNotificacao) {
      console.log("🚫 Usuário sem token FCM:", usuario.usuario);
      return;
    }

    console.log("🎯 Enviando notificação para:", usuario.nome || usuario.usuario);
    console.log("🔑 Token:", usuario.tokenNotificacao.substring(0, 25) + "...");

    const notification = {
      title: "🔧 Nova OS Atribuída!",
      body: `${os.titulo || "Ordem de serviço"} - ${os.setor || "Setor não informado"}`,
    };

    const data = {
      osId: String(os.id || ""),
      click_action: "https://embalagens-ods-t.vercel.app/",
    };

    // 🚀 Envia a notificação push pelo FCM
    const response = await messaging.send({
      token: usuario.tokenNotificacao,
      notification,
      data,
      webpush: {
        fcmOptions: { link: "https://embalagens-ods-t.vercel.app/" },
        headers: { TTL: "60" },
      },
    });

    console.log(`✅ Notificação enviada com sucesso para ${usuario.usuario} (FCM ID: ${response})`);
  } catch (error) {
    console.error("❌ Erro ao enviar notificação:", error);
  }
}
