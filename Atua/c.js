// Variáveis globais
let ordensServico = [];
let tecnicos = [];
let usuarios = [
    { id: 1, usuario: 'admin', senha: 'admin123', nome: 'Administrador', tipo: 'admin' }
];

let proximoId = 1;
let usuarioLogado = null;

// Sistema de navegação
let historicoNavegacao = ['dashboard'];
let paginaAtual = 'dashboard';

// Sistema de sincronização
const SYNC_INTERVAL = 30000; // 30 segundos
let syncTimer = null;

// Variáveis para controle dos steps
let currentStep = 1;
const totalSteps = 4;
// Variáveis para gráficos

let graficoStatusChart = null;
let graficoPrioridadeChart = null;
let graficoTecnicosChart = null;


// Sistema de Sincronização de Dados em Nuvem
// URL base do seu Realtime Database (sem /dados e sem /tecnicos/0)
let FIREBASE_URL = localStorage.getItem('firebaseURL')
    || 'https://teste-b4489-default-rtdb.firebaseio.com';

let isOnline = navigator.onLine;

let syncQueue = []; // Fila de sincronização para quando estiver offline

// Inicialização
document.addEventListener('DOMContentLoaded', function () {
    inicializarSistema();
});
function inicializarSistema() {
    verificarConexao();
    carregarDados();
    verificarLogin();
    iniciarSincronizacao();

}

function verificarConexao() {
    window.addEventListener('online', () => {
        isOnline = true;
        atualizarStatusSync('success', 'Online');
        processarFilaSincronizacao();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        atualizarStatusSync('offline', 'Offline');
    });
}

function atualizarSistema() {
    // Só atualiza os painéis permitidos para o tipo do usuário
    if (usuarioLogado?.tipo === 'admin') {
        carregarListaOS();
        atualizarDashboard();
    } else if (usuarioLogado?.tipo === 'mecanico') {
        carregarMinhasOS();
    } else if (usuarioLogado?.tipo === 'funcionario') {
        atualizarProximoNumero?.();
    }

    // Pode adicionar outras atualizações comuns aqui se quiser
}


async function carregarDados() {
    try {
        atualizarStatusSync('syncing', 'Carregando dados...');

        if (isOnline) {
            const dadosNuvem = await carregarDaNuvem();
            if (dadosNuvem) {
                ordensServico = dadosNuvem.ordensServico || [];
                tecnicos = dadosNuvem.tecnicos || [];
                usuarios = dadosNuvem.usuarios || [
                    { id: 1, usuario: 'admin', senha: 'admin123', nome: 'Administrador', tipo: 'admin' }
                ];
                proximoId = dadosNuvem.proximoId || 1;

                console.log('Dados carregados da nuvem');
                atualizarStatusSync('success', 'Sincronizado');
                return;
            } else {
                console.warn('Nenhum dado retornado da nuvem, usando dados padrão');
            }
        } else {
            atualizarStatusSync('offline', 'Sem conexão com a nuvem');
        }

        // Se não conseguir da nuvem, inicializa com dados padrão
        ordensServico = [];
        tecnicos = [];
        usuarios = [
            { id: 1, usuario: 'admin', senha: 'admin123', nome: 'Administrador', tipo: 'admin' }
        ];
        notas = dadosNuvem.notas || [];
        proximoId = 1;

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        atualizarStatusSync('error', 'Erro ao carregar dados');
    }
}


async function carregarDaNuvem() {
    try {
        const response = await fetch(`${FIREBASE_URL}/dados.json`);
        if (response.ok) return await response.json();
        return null;
    } catch (error) {
        console.error('Erro ao carregar da nuvem:', error);
        return null;
    }
}

async function salvarNaNuvem() {
    if (!isOnline) {
        syncQueue.push('salvar');
        return false;
    }
    try {
        const dados = {
            ordensServico,
            tecnicos,
            usuarios,
            notas, // ✅ salvar notas
            proximoId,
            ultimaAtualizacao: new Date().toISOString(),
            versao: Date.now()
        };

        // Aqui ele vai salvar em https://teste-b4489-default-rtdb.firebaseio.com/dados.json
        const response = await fetch(`${FIREBASE_URL}/dados.json`, {
            method: 'PUT', // pode trocar por PATCH se não quiser sobrescrever tudo
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (response.ok) {
            ultimaSincronizacaoVar = new Date().toISOString();
            versaoLocalVar = dados.versao;
            console.log('Dados salvos na nuvem');
            atualizarStatusSync('success', 'Sincronizado');
            return true;
        } else throw new Error('Erro ao salvar na nuvem');
    } catch (error) {
        console.error('Erro ao salvar na nuvem:', error);
        atualizarStatusSync('error', 'Erro na sincronização');
        syncQueue.push('salvar');
        return false;
    }
}

async function salvarDados() {
    try {
        if (isOnline) {
            atualizarStatusSync('syncing', 'Sincronizando...');
            await salvarNaNuvem();
            // ✅ NOVO: recarregar da nuvem e atualizar interface
            const dadosNuvem = await carregarDaNuvem();
            if (dadosNuvem) {
                ordensServico = dadosNuvem.ordensServico || [];
                tecnicos = dadosNuvem.tecnicos || [];
                usuarios = dadosNuvem.usuarios || [];
                proximoId = dadosNuvem.proximoId || 1;
            }
            atualizarSistema();
        } else {
            syncQueue.push('salvar');
            atualizarStatusSync('offline', 'Salvo em fila (sem persistência local)');
        }
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        atualizarStatusSync('error', 'Erro ao salvar');
    }
}


async function processarFilaSincronizacao() {
    if (!isOnline || syncQueue.length === 0) return;

    atualizarStatusSync('syncing', 'Sincronizando pendências...');

    while (syncQueue.length > 0) {
        const acao = syncQueue.shift();
        if (acao === 'salvar') {
            await salvarNaNuvem();
        }
    }
    // antes ou depois do processamento normal:
    await processarFilaSincronizacaoChat();

}

async function sincronizarComServidor() {
    if (!isOnline) {
        atualizarStatusSync('offline', 'Offline');
        return;
    }

    try {
        atualizarStatusSync('syncing', 'Verificando atualizações.');

        // carrega dados da nuvem
        const dadosNuvem = await carregarDaNuvem();
        const versaoNuvem = (dadosNuvem && typeof dadosNuvem.versao === 'number') ? dadosNuvem.versao : 0;
        const versaoLocal = (typeof versaoLocalVar === 'number') ? versaoLocalVar : 0;

        if (versaoNuvem > versaoLocal) {
            // Nuvem tem versão mais recente -> baixar
            ordensServico = dadosNuvem.ordensServico || [];
            tecnicos = dadosNuvem.tecnicos || [];
            usuarios = dadosNuvem.usuarios || [];
            proximoId = dadosNuvem.proximoId || 1;
            versaoLocalVar = versaoNuvem;
            ultimaSincronizacaoVar = new Date().toISOString();

            if (usuarioLogado) {
                atualizarDashboard();
                carregarListaOS();
                carregarTecnicos();
                carregarConfiguracoes();
            }
        } else if (versaoNuvem < versaoLocal) {
            // Local mais novo -> enviar para a nuvem
            await salvarNaNuvem();
        } else {
            // mesmas versões -> processar fila local se houver
            await processarFilaSincronizacao();
        }

        atualizarStatusSync('success', 'Sincronizado');
    } catch (error) {
        console.error('Erro na sincronização:', error);
        atualizarStatusSync('error', 'Erro na sincronização');
    }
}


function atualizarStatusSync(status, texto) {
    const iconSync = document.getElementById('iconSync');
    const textSync = document.getElementById('textSync');
    const statusSync = document.getElementById('statusSync');

    if (!iconSync || !textSync || !statusSync) return;

    statusSync.classList.remove('hidden');

    switch (status) {
        case 'success':
            iconSync.className = 'fas fa-cloud text-green-400';
            textSync.textContent = texto;
            break;
        case 'error':
            iconSync.className = 'fas fa-exclamation-triangle text-red-400';
            textSync.textContent = texto;
            break;
        case 'syncing':
            iconSync.className = 'fas fa-sync-alt fa-spin text-blue-400';
            textSync.textContent = texto;
            break;
        case 'offline':
            iconSync.className = 'fas fa-wifi text-gray-400';
            textSync.textContent = 'Offline';
            break;
    }

    // Esconder status após 3 segundos se for sucesso
    if (status === 'success') {
        setTimeout(() => {
            statusSync.classList.add('hidden');
        }, 3000);
    }
}

function iniciarSincronizacao() {
    // Sincronizar periodicamente
    syncTimer = setInterval(() => {
        sincronizarComServidor();
    }, SYNC_INTERVAL);

    // Sincronizar quando a página ganhar foco
    window.addEventListener('focus', () => {
        sincronizarComServidor();
    });

    // Detectar se está online/offline
    window.addEventListener('online', () => {
        atualizarStatusSync('success', 'Online');
        sincronizarComServidor();
    });

    window.addEventListener('offline', () => {
        atualizarStatusSync('offline', 'Offline');
    });
}

// Sistema de Navegação com Histórico
function adicionarAoHistorico(pagina) {
    if (paginaAtual !== pagina) {
        historicoNavegacao.push(paginaAtual);
        paginaAtual = pagina;
        atualizarBotaoVoltar();
    }
}

function voltarPaginaAnterior() {
    if (historicoNavegacao.length > 0) {
        const paginaAnterior = historicoNavegacao.pop();
        paginaAtual = paginaAnterior;
        showTab(paginaAnterior, false); // false para não adicionar ao histórico novamente
        atualizarBotaoVoltar();
    }
}

function atualizarBotaoVoltar() {
    const btnVoltar = document.getElementById('btnVoltarMobile');
    if (btnVoltar) {
        if (historicoNavegacao.length > 0 && window.innerWidth < 768) {
            btnVoltar.style.display = 'block';
        } else {
            btnVoltar.style.display = 'none';
        }
    }
}

// Atualizar quando a tela for redimensionada
window.addEventListener('resize', atualizarBotaoVoltar);

// Sistema de Login
function verificarLogin() {
    // tenta recuperar sessão salva
    const usuarioSalvo = sessionStorage.getItem('usuarioLogado');

    if (usuarioSalvo) {
        usuarioLogado = JSON.parse(usuarioSalvo); // recupera dados
        iniciarSistema();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainSystem').classList.add('hidden');
    }
}


// Proteção avançada contra DevTools e manipulação
(function () {
    // Múltiplas camadas de detecção
    let devtools = { open: false, orientation: null };
    const threshold = 160;

    // Detecção por tamanho da janela
    setInterval(function () {
        if (window.outerHeight - window.innerHeight > threshold ||
            window.outerWidth - window.innerWidth > threshold) {
            if (!devtools.open) {
                devtools.open = true;
                bloquearAcesso('DevTools Detectado');
            }
        } else {
            devtools.open = false;
        }
    }, 100);

    // Detecção por console
    let devToolsChecker = () => {
        let before = new Date();
        debugger;
        let after = new Date();
        if (after - before > 100) {
            bloquearAcesso('Console Detectado');
        }
    };
    setInterval(devToolsChecker, 1000);

    // Função para bloquear acesso


    // Bloquear teclas perigosas
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'u') ||
            (e.ctrlKey && e.key === 's')) {
            e.preventDefault();
            e.stopPropagation();
            bloquearAcesso('Ação Bloqueada');
            return false;
        }
    });

    // Bloquear menu de contexto
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        return false;
    });

    // Proteção contra seleção de texto
    document.addEventListener('selectstart', function (e) {
        e.preventDefault();
        return false;
    });

    // Detectar ferramentas de desenvolvedor por performance
    let start = performance.now();
    setInterval(() => {
        let now = performance.now();
        if (now - start > 200) {
            bloquearAcesso('Ferramenta de Debug Detectada');
        }
        start = now;
    }, 100);
})();

// Sistema de proteção contra brute-force
const bruteForceProtection = {
    tentativas: {},
    maxTentativas: 3,
    tempoBloqueioPorTentativa: 10000, // 30 segundos base

    verificarTentativas(usuario) {
        const agora = Date.now();
        if (!this.tentativas[usuario]) {
            this.tentativas[usuario] = { count: 0, ultimaTentativa: agora, bloqueadoAte: 0 };
        }

        const dados = this.tentativas[usuario];

        // Verificar se ainda está bloqueado
        if (dados.bloqueadoAte > agora) {
            const tempoRestante = Math.ceil((dados.bloqueadoAte - agora) / 1000);
            throw new Error(`Usuário bloqueado. Tente novamente em ${tempoRestante} segundos.`);
        }

        return true;
    },

    registrarTentativaFalha(usuario) {
        const agora = Date.now();
        if (!this.tentativas[usuario]) {
            this.tentativas[usuario] = { count: 0, ultimaTentativa: agora, bloqueadoAte: 0 };
        }

        const dados = this.tentativas[usuario];
        dados.count++;
        dados.ultimaTentativa = agora;

        if (dados.count >= this.maxTentativas) {
            // Tempo de bloqueio exponencial: 30s, 2min, 5min, 15min...
            const tempoBloqueioPorTentativa = this.tempoBloqueioPorTentativa * Math.pow(2, dados.count - this.maxTentativas);
            dados.bloqueadoAte = agora + tempoBloqueioPorTentativa;

            const minutos = Math.ceil(tempoBloqueioPorTentativa / 60000);
            throw new Error(`Muitas tentativas falharam. Usuário bloqueado por ${minutos} minuto(s).`);
        }
    },

    registrarTentativaSucesso(usuario) {
        if (this.tentativas[usuario]) {
            this.tentativas[usuario] = { count: 0, ultimaTentativa: Date.now(), bloqueadoAte: 0 };
        }
    }
};

const sessionProtection = {
    tempoExpiracao: Infinity, // 30 minutos

    criarSessaoSegura(usuario) {
        const agora = Date.now();
        const dadosSessao = {
            ...usuario,
            criadaEm: agora,
            expiraEm: agora + this.tempoExpiracao
        };

        // Salva no localStorage para persistir mesmo fechando o navegador
        localStorage.setItem('usuarioLogado', JSON.stringify(dadosSessao));
        return dadosSessao;
    },

    verificarSessao() {
        const sessaoSalva = localStorage.getItem('usuarioLogado'); // ✅ troquei para localStorage
        if (!sessaoSalva) return null;

        try {
            const dadosSessao = JSON.parse(sessaoSalva);

            // Se for sessão antiga (sem expiraEm), aceitar como válida
            if (!dadosSessao.expiraEm) {
                return dadosSessao;
            }

            const agora = Date.now();

            // Verificar expiração
            if (dadosSessao.expiraEm < agora) {
                this.limparSessao();
                return null;
            }

            // Renovar sessão se estiver próxima do vencimento (últimos 5 minutos)
            if (dadosSessao.expiraEm - agora < 5 * 60 * 1000) {
                dadosSessao.expiraEm = agora + this.tempoExpiracao;
                localStorage.setItem('usuarioLogado', JSON.stringify(dadosSessao)); // ✅ aqui também
            }

            return dadosSessao;
        } catch (error) {
            this.limparSessao();
            return null;
        }
    },

    limparSessao() {
        localStorage.removeItem('usuarioLogado'); // ✅ aqui também
    }
};


// Função para hash da senha
async function hashSenha(senha) {
    const encoder = new TextEncoder();
    const data = encoder.encode(senha + 'salt_secreto_2024'); // Adicionar salt
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Função para verificar se senha já está com hash
function isHash(senha) {
    return senha.length === 64 && /^[a-f0-9]+$/i.test(senha);
}

// Sistema de Login
function verificarLogin() {
    carregarDados().then(() => {
        // Verificar sessão existente
        const usuarioSessao = sessionProtection.verificarSessao();
        if (usuarioSessao) {
            usuarioLogado = usuarioSessao;
            iniciarSistema();
            return;
        }

        // Mostrar tela de login
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainSystem').classList.add('hidden');
    });
}

document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    carregarDados().then(async () => {
        const usuario = document.getElementById('loginUser').value;
        const senha = document.getElementById('loginPassword').value;

        try {
            // Verificar proteção contra brute-force
            bruteForceProtection.verificarTentativas(usuario);

            // Procurar usuário
            const usuarioEncontrado = usuarios.find(u => u.usuario === usuario);

            if (usuarioEncontrado) {
                let senhaCorreta = false;

                // Verificar se a senha no banco já está com hash
                if (isHash(usuarioEncontrado.senha)) {
                    // Senha no banco já tem hash, comparar com hash da senha digitada
                    const senhaHash = await hashSenha(senha);
                    senhaCorreta = usuarioEncontrado.senha === senhaHash;
                } else {
                    // Senha no banco ainda é texto simples, comparar diretamente
                    senhaCorreta = usuarioEncontrado.senha === senha;

                    // Se login correto, atualizar para hash
                    if (senhaCorreta) {
                        usuarioEncontrado.senha = await hashSenha(senha);
                        const idx = usuarios.findIndex(u => u.id === usuarioEncontrado.id);
                        if (idx !== -1) usuarios[idx] = usuarioEncontrado;
                        salvarDados(); // Salvar com hash
                    }
                }

                if (senhaCorreta) {
                    // 🔹 Verificar se está ativo (exceto admin, que sempre entra)
                    if (usuarioEncontrado.tipo !== 'admin' && !usuarioEncontrado.ativo) {
                        mostrarToast('Conta pendente de aprovação pelo administrador!', 'error');
                        return;
                    }

                    // Registrar sucesso no sistema de brute-force
                    bruteForceProtection.registrarTentativaSucesso(usuario);

                    // Atualiza data da última entrada
                    usuarioEncontrado.ultimaEntrada = new Date().toISOString();

                    // Atualiza no array global de usuários
                    const idx = usuarios.findIndex(u => u.id === usuarioEncontrado.id);
                    if (idx !== -1) usuarios[idx] = usuarioEncontrado;

                    // Define usuário logado e cria sessão segura
                    usuarioLogado = usuarioEncontrado;
                    sessionProtection.criarSessaoSegura(usuarioLogado);
                    // Mostrar toast antes de entrar
                    mostrarToast('Entrando...', 'success');
                    // Salvar com a última entrada já atualizada
                    await salvarDados();



                    // Pequeno delay para dar tempo do toast aparecer antes do refresh
                    setTimeout(() => {
                        location.reload();
                    }, 300);
                }
                else {
                    // Registrar falha no sistema de brute-force
                    bruteForceProtection.registrarTentativaFalha(usuario);
                    mostrarToast('Usuário ou senha incorretos!', 'error');
                }
            } else {
                // Registrar falha mesmo para usuário inexistente (evitar enumeração)
                bruteForceProtection.registrarTentativaFalha(usuario);
                mostrarToast('Usuário ou senha incorretos!', 'error');
            }
        } catch (error) {
            mostrarToast(error.message, 'error');
        }
    });
});

// Formulário de cadastro (usuário criando sua própria conta)
document.getElementById('cadastroForm').addEventListener('submit', function (e) {
    e.preventDefault();

    carregarDados().then(async () => {
        const nome = document.getElementById('cadastroNome').value;
        const usuario = document.getElementById('cadastroUser').value;
        const senha = document.getElementById('cadastroPassword').value;
        const confirmarSenha = document.getElementById('cadastroConfirmPassword').value;
        const tipo = document.getElementById('cadastroTipo').value;

        // Validações básicas
        if (senha !== confirmarSenha) {
            mostrarToast('As senhas não coincidem!', 'error');
            return;
        }

        if (senha.length < 3) {
            mostrarToast('A senha deve ter pelo menos 3 caracteres!', 'error');
            return;
        }

        // Verificar se o usuário já existe
        if (usuarios.find(u => u.usuario === usuario)) {
            mostrarToast('Nome de usuário já existe!', 'error');
            return;
        }

        // Hash da senha antes de salvar
        const senhaHash = await hashSenha(senha);

        // Criar novo usuário
        const novoUsuario = {
            id: Date.now(),
            usuario: usuario,
            senha: senhaHash, // 🔹 senha com hash
            nome: nome,
            tipo: tipo,
            ativo: false, // 🔹 sempre pendente para auto-cadastro
            dataUltimoCadastro: new Date().toISOString()
        };

        usuarios.push(novoUsuario);
        salvarDados();

        // Limpar formulário
        document.getElementById('cadastroForm').reset();

        // Voltar para login
        mostrarTabLogin();

        mostrarToast('Conta criada! Aguarde aprovação do administrador.');
    });
});





// Funções para alternar entre login e cadastro
function mostrarTabLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('cadastroForm').classList.add('hidden');

    document.getElementById('tabLogin').className = 'flex-1 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-600';
    document.getElementById('tabCadastro').className = 'flex-1 py-3 text-sm font-medium border-b-2 border-gray-200 text-gray-500';
}

function mostrarTabCadastro() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('cadastroForm').classList.remove('hidden');

    document.getElementById('tabLogin').className = 'flex-1 py-3 text-sm font-medium border-b-2 border-gray-200 text-gray-500';
    document.getElementById('tabCadastro').className = 'flex-1 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-600';
}

function iniciarSistema() {
    // Esconde tela de login e mostra sistema principal
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainSystem').classList.remove('hidden');

    if (!usuarioLogado) {
        console.error('Usuário não definido!');
        return;
    }

    // Configurar interface baseada no tipo de usuário
    configurarInterface();

    // Inicializar hora
    atualizarHora();
    setInterval(atualizarHora, 1000);

    // Mostrar informações do usuário no header
    const userInfoEl = document.getElementById('userInfo');
    const userRoleEl = document.getElementById('userRole');
    if (userInfoEl) userInfoEl.textContent = usuarioLogado.nome || '';
    if (userRoleEl) userRoleEl.textContent = getTipoUsuarioTexto(usuarioLogado.tipo || '');

    // ⚡ Ações específicas por tipo de usuário
    if (usuarioLogado.tipo === 'funcionario') {
        paginaAtual = 'nova';
        showTab('nova', false);

        currentStep = 1;
        atualizarStep();
        atualizarProximoNumero();

    } else if (usuarioLogado.tipo === 'mecanico') {
        paginaAtual = 'mecanico';
        showTab('mecanico', false);

        carregarMinhasOS();

        setTimeout(() => {
            if (paginaAtual === 'mecanico') {
                carregarMinhasOS();
            }
        }, 1000);

    } else if (usuarioLogado.tipo === 'admin') {
        paginaAtual = 'dashboard';
        showTab('dashboard', false);

        carregarTecnicos();
        atualizarDashboard();
    }

    // ⚡ Inicializa o chat automaticamente
    inicializarChat();

    // Apenas adiciona eventos para abrir a aba (chat já estará pronto)
    ['chatBtnDesktop', 'chatBtnMobile'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => showTab('chatTab'));
        }
    });
}



function configurarInterface() {
    const tipo = usuarioLogado.tipo;

    // Elementos que só admin pode ver
    const adminElements = ['usuariosSection', 'backupSection'];
    adminElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = tipo === 'admin' ? 'block' : 'none';
        }
    });

    // Botões da lista de OS - apenas admin pode ver
    const listaElements = ['listaBtnDesktop', 'listaTabBtn'];
    listaElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = (tipo === 'admin') ? 'block' : 'none';
        }
    });

    // Elementos que admin e funcionário podem ver (criar OS)
    const adminFuncElements = ['novaOSBtn', 'novaOSBtnDesktop', 'fabBtn'];
    adminFuncElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = (tipo === 'admin' || tipo === 'funcionario') ? 'block' : 'none';
        }
    });

    // Dashboard - apenas admin pode ver
    const dashboardElements = ['dashboardBtnDesktop'];
    dashboardElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = (tipo === 'admin') ? 'block' : 'none';
        }
    });

    // Configurações - todos podem ver
    const configElements = ['configBtn', 'configBtnDesktop'];
    configElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'block';
        }
    });

    // Seção de técnicos - apenas admin pode ver
    const tecnicosSection = document.getElementById('tecnicosSection');
    if (tecnicosSection) {
        tecnicosSection.style.display = tipo === 'admin' ? 'block' : 'none';
    }

    // Tab de gestão de mecânicos - apenas admin pode ver
    const adminMecanicosTab = document.getElementById('adminMecanicosTab');
    if (adminMecanicosTab) {
        if (tipo === 'admin') {
            adminMecanicosTab.classList.remove('hidden');
        } else {
            adminMecanicosTab.classList.add('hidden');
        }
    }

    // Tab específica do mecânico
    if (tipo === 'mecanico') {
        document.getElementById('mecanicoTab')?.classList.remove('hidden');
        document.getElementById('solicitarAdmBtnDesktop')?.classList.remove('hidden');
        document.getElementById('notasTab')?.classList.remove('hidden'); // ✅ só mecânico vê

        // Navegação mobile para mecânico
        const mobileNav = document.getElementById('mobileNav');
        mobileNav.innerHTML = `
            <button onclick="showTab('mecanico')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-wrench block mb-1"></i>
                <span>Minhas</span>
            </button>
            <button onclick="showTab('chatTab')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500" id="chatBtnMobile">
                <i class="fas fa-comments block mb-1"></i>
                <span>Chat</span>
            </button>
            <button onclick="solicitarAdm()" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-user-shield block mb-1"></i>
                <span>Solicitar ADM</span>
            </button>
            <button onclick="showTab('config')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-cog block mb-1"></i>
                <span>Config</span>
            </button>
        `;
    } else if (tipo === 'funcionario') {
        // Mostra botão no desktop
        document.getElementById('minhasOSFuncionarioBtnDesktop')?.classList.remove('hidden');

        // Navegação mobile para funcionário
        const mobileNav = document.getElementById('mobileNav');
        mobileNav.innerHTML = `
            <button onclick="showTab('nova')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-plus block mb-1"></i>
                <span>Nova</span>
            </button>
            <button onclick="showTab('minhasOSFuncionario')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-folder-open block mb-1"></i>
                <span>Minhas</span>
            </button>
            <button onclick="showTab('chatTab')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500" id="chatBtnMobile">
                <i class="fas fa-comments block mb-1"></i>
                <span>Chat</span>
            </button>
            <button onclick="showTab('config')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
                <i class="fas fa-cog block mb-1"></i>
                <span>Config</span>
            </button>
        `;
    } else if (tipo === 'admin') {
        // Navegação mobile para admin
    const mobileNav = document.getElementById('mobileNav');
    mobileNav.innerHTML = `
        <button onclick="showTab('dashboard')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-home block mb-1"></i>
            <span>Início</span>
        </button>
        <button onclick="showTab('lista')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-list block mb-1"></i>
            <span>Lista</span>
        </button>
        <button onclick="showTab('nova')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-plus block mb-1"></i>
            <span>Nova</span>
        </button>
        <button onclick="showTab('adminMecanicos')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-users-cog block mb-1"></i>
            <span>Mecânicos</span>
        </button>
        <button onclick="showTab('chatTab')" id="chatBtnMobile" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-comments block mb-1"></i>
            <span>Chat</span>
        </button>
        <button onclick="showTab('config')" class="tab-btn flex-1 py-3 text-center text-xs text-gray-500">
            <i class="fas fa-cog block mb-1"></i>
            <span>Config</span>
        </button>
    `;
}
}


// Alterar senha do admin
document.getElementById('alterarSenhaForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const senhaAtual = document.getElementById('senhaAtual').value;
    const novaSenha = document.getElementById('novaSenha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;

    // 🔹 Gerar hash da senha atual digitada
    const senhaAtualHash = await hashSenha(senhaAtual);

    // 🔹 Verificar senha atual
    if (usuarioLogado.senha !== senhaAtualHash) {
        mostrarToast('Senha atual incorreta!', 'error');
        return;
    }

    // 🔹 Verificar se as senhas coincidem
    if (novaSenha !== confirmarSenha) {
        mostrarToast('As senhas não coincidem!', 'error');
        return;
    }

    // 🔹 Verificar tamanho mínimo
    if (novaSenha.length < 3) {
        mostrarToast('A nova senha deve ter pelo menos 3 caracteres!', 'error');
        return;
    }

    // 🔹 Gerar hash da nova senha
    const novaSenhaHash = await hashSenha(novaSenha);

    // Atualizar senha do usuário logado
    const usuario = usuarios.find(u => u.id === usuarioLogado.id);
    if (usuario) {
        usuario.senha = novaSenhaHash;
        usuarioLogado.senha = novaSenhaHash;

        salvarDados();
        sessionStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

        document.getElementById('alterarSenhaForm').reset();
        mostrarToast('Senha alterada com sucesso!');
    }
});


function logout() {
    usuarioLogado = null;

    // Limpa dados salvos
    localStorage.clear();
    sessionStorage.clear();

    // Mostra toast de saída em vermelho
    mostrarToast('Saindo do sistema...', 'error');

    // Espera um pouco e recarrega a página
    setTimeout(() => {
        location.reload();
    }, 2000);
}

function getTipoUsuarioTexto(tipo) {
    const tipos = {
        'admin': 'Administrador',
        'funcionario': 'Funcionário',
        'mecanico': 'Mecânico'
    };
    return tipos[tipo] || tipo;
}

function atualizarHora() {
    const now = new Date();
    document.getElementById('currentTime').textContent =
        now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        carregarMinhasOS()
}

function podeAcessarTab(tabName) {
    if (!usuarioLogado || !usuarioLogado.tipo) return false;

    const permissoes = {
        admin: ['dashboard', 'lista', 'nova', 'mecanico', 'adminMecanicos', 'chatTab', 'config'],
        funcionario: ['nova', 'chatTab', 'config', 'minhasOSFuncionario'],
        mecanico: ['mecanico', 'chatTab', 'config', 'notas'] // ✅ incluí notas aqui
    };

    return permissoes[usuarioLogado.tipo]?.includes(tabName) || false;
}



function showTab(tabName, adicionarHistorico = true) {
    // Verificar permissões
    if (!podeAcessarTab(tabName)) {
        mostrarToast('Acesso negado!', 'error');

        // 🔒 Forçar volta para a aba padrão do tipo
        if (usuarioLogado?.tipo === 'funcionario') {
            tabName = 'nova';
        } else if (usuarioLogado?.tipo === 'mecanico') {
            tabName = 'mecanico';
        } else {
            tabName = 'dashboard';
        }
    }

    if (adicionarHistorico) {
        adicionarAoHistorico(tabName);
    }

    // Esconde todas as tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));

    // Remove ativo dos botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('tab-active');
        btn.classList.add('text-gray-500');
    });

    // Mostra tab atual
    document.getElementById(tabName)?.classList.remove('hidden');

    // Marca o botão como ativo
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes(`showTab('${tabName}')`)) {
            btn.classList.remove('text-gray-500');
            btn.classList.add('tab-active');
        }
    });

    // Ações específicas por tab
    switch (tabName) {
        case 'dashboard': atualizarDashboard(); break;
        case 'lista': carregarListaOS(); break;
        case 'nova':
            currentStep = 1;
            atualizarStep();
            atualizarProximoNumero();
            break;
        case 'mecanico': carregarMinhasOS(); break;
        case 'adminMecanicos': carregarTodasOSMecanicos(); break;
        case 'config': carregarConfiguracoes(); break;
        case 'minhasOSFuncionario': carregarMinhasOSFuncionario(); break;
        case 'notas':
            carregarNotas();
            break;

    }
}

function podeAcessarTab(tabName) {
    if (!usuarioLogado || !usuarioLogado.tipo) return false;

    const permissoes = {
        admin: ['dashboard', 'lista', 'nova', 'mecanico', 'adminMecanicos', 'chatTab', 'config'],
        funcionario: ['nova', 'chatTab', 'config', 'minhasOSFuncionario'],
        mecanico: ['mecanico', 'chatTab', 'config', 'notas'] // ✅ Notas liberado
    };

    return permissoes[usuarioLogado.tipo]?.includes(tabName) || false;
}



function abrirModalUsuario() {
    document.getElementById('modalUsuario').classList.remove('hidden');
}

function fecharModalUsuario() {
    document.getElementById('modalUsuario').classList.add('hidden');
    document.getElementById('usuarioForm').reset();
}

function abrirModalTecnico() {
    carregarUsuariosMecanicos();
    document.getElementById('modalTecnico').classList.remove('hidden');
}

function fecharModalTecnico() {
    document.getElementById('modalTecnico').classList.add('hidden');
    document.getElementById('tecnicoForm').reset();
}

function abrirModalAdmin() {
    document.getElementById('modalAdmin').classList.remove('hidden');
}

function fecharModalAdmin() {
    document.getElementById('modalAdmin').classList.add('hidden');
    document.getElementById('adminForm').reset();
}

function carregarUsuariosMecanicos() {
    const select = document.getElementById('usuarioTecnico');
    select.innerHTML = '<option value="">Nenhum usuário vinculado</option>';

    const mecanicos = usuarios.filter(u => u.tipo === 'mecanico');
    mecanicos.forEach(mecanico => {
        const option = document.createElement('option');
        option.value = mecanico.usuario;
        option.textContent = `${mecanico.nome} (${mecanico.usuario})`;
        select.appendChild(option);
    });
}

document.getElementById('usuarioForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const nome = document.getElementById('nomeUsuario').value;
    const login = document.getElementById('loginUsuario').value;
    const senha = document.getElementById('senhaUsuario').value;
    const tipo = document.getElementById('tipoUsuario').value;

    if (usuarios.find(u => u.usuario === login)) {
        mostrarToast('Nome de usuário já existe!', 'error');
        return;
    }

    const novoUsuario = {
        id: Date.now(),
        usuario: login,
        senha: senha,
        nome: nome,
        tipo: tipo,
        ativo: true, // 🔹 admin já cria conta aprovada
        dataUltimoCadastro: new Date().toISOString()
    };

    usuarios.push(novoUsuario);
    salvarDados();

    fecharModalUsuario();
    carregarListaUsuarios();
    mostrarToast('Usuário criado e ativado!');
});

document.getElementById('tecnicoForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const nome = document.getElementById('nomeTecnico').value.trim();
    const especialidade = document.getElementById('especialidadeTecnico').value.trim();
    const usuario = document.getElementById('usuarioTecnico').value.trim() || null;

    // Verificar se o técnico já existe pelo nome ou usuário
    let tecnicoExistente = tecnicos.find(t => t.nome === nome || (t.usuario && t.usuario === usuario));

    if (tecnicoExistente) {
        // Se existir, apenas atualiza a especialidade
        tecnicoExistente.especialidade = especialidade;
        mostrarToast(`Especialidade do técnico "${nome}" atualizada!`);
    } else {
        // Se não existir, cria um novo técnico
        const novoTecnico = {
            id: Date.now(),
            nome: nome,
            especialidade: especialidade,
            usuario: usuario
        };
        tecnicos.push(novoTecnico);
        mostrarToast(`Técnico "${nome}" criado com sucesso!`);
    }

    salvarDados();
    fecharModalTecnico();
    carregarTecnicos();
    carregarListaTecnicos();
});


document.getElementById('adminForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const nome = document.getElementById('nomeAdmin').value;
    const login = document.getElementById('loginAdmin').value;
    const senha = document.getElementById('senhaAdmin').value;

    // Verificar se o usuário já existe
    if (usuarios.find(u => u.usuario === login)) {
        mostrarToast('Nome de usuário já existe!', 'error');
        return;
    }

    const novoAdmin = {
        id: Date.now(),
        usuario: login,
        senha: senha,
        nome: nome,
        tipo: 'admin',
        dataUltimoCadastro: new Date().toISOString()
    };

    usuarios.push(novoAdmin);
    salvarDados();

    fecharModalAdmin();
    carregarListaUsuarios();
    mostrarToast('Administrador criado com sucesso!');
});


function carregarTecnicos(selectOverride = null) {
    const select = selectOverride || document.getElementById('tecnico');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um técnico</option>';

    tecnicos.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nome;
        select.appendChild(opt);
    });
}

function carregarConfiguracoes() {
    // Atualizar informações pessoais
    atualizarInformacoesPessoais();

    if (usuarioLogado.tipo === 'admin') {
        carregarListaUsuarios();
        carregarListaTecnicos();
        carregarSolicitacoesSenha(); // ✅ ADICIONE ESTA LINHA
        atualizarStatusBanco();
    }
    if (usuarioLogado.tipo === 'admin') {
        document.getElementById('ultimaEntradaSection').classList.remove('hidden');
        carregarUltimasEntradas();
    }

}

function carregarUltimasEntradas() {
    const tbody = document.getElementById('tabelaUltimaEntrada');
    tbody.innerHTML = '';

    usuarios.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="py-2">${u.id}</td>
            <td class="py-2">${u.usuario}</td>
            <td class="py-2">${u.nome}</td>
            <td class="py-2 capitalize">${u.tipo}</td>
            <td class="py-2">${u.ultimaEntrada ? new Date(u.ultimaEntrada).toLocaleString('pt-BR') : 'Nunca'}</td>
        `;
        tbody.appendChild(tr);
    });
}



function atualizarStatusBanco() {
    const statusConexao = document.getElementById('statusConexao');
    const indicadorConexao = document.getElementById('indicadorConexao');
    const urlBanco = document.getElementById('urlBanco');
    const ultimaSync = document.getElementById('ultimaSync');
    const dadosNaFila = document.getElementById('dadosNaFila');
    const modoOperacao = document.getElementById('modoOperacao');

    if (urlBanco) {
        urlBanco.value = 'https://teste-b4489-default-rtdb.firebaseio.com/';
    }

    if (statusConexao && indicadorConexao) {
        if (isOnline) {
            statusConexao.textContent = 'Conectado à nuvem';
            indicadorConexao.className = 'w-4 h-4 rounded-full bg-green-500';
        } else {
            statusConexao.textContent = 'Offline - Usando dados locais';
            indicadorConexao.className = 'w-4 h-4 rounded-full bg-red-500';
        }
    }

    if (ultimaSync) {
        const ultimaSincronizacao = localStorage.getItem('ultimaSincronizacao');
        if (ultimaSincronizacao) {
            ultimaSync.textContent = new Date(ultimaSincronizacao).toLocaleString('pt-BR');
        } else {
            ultimaSync.textContent = 'Nunca';
        }
    }

    if (dadosNaFila) {
        dadosNaFila.textContent = syncQueue.length;
    }

    if (modoOperacao) {
        modoOperacao.textContent = isOnline ? 'Online' : 'Offline';
    }
}

async function testarConexao() {
    const FIREBASE_URL = 'https://teste-b4489-default-rtdb.firebaseio.com/';
    const urlInput = document.getElementById('urlBanco');

    // Preencher o input com a URL fixa
    urlInput.value = FIREBASE_URL;

    try {
        atualizarStatusSync('syncing', 'Testando conexão...');

        const response = await fetch(`${FIREBASE_URL}.json`);

        if (response.ok) {
            localStorage.setItem('firebaseURL', FIREBASE_URL);

            mostrarToast('Conexão testada com sucesso!');
            atualizarStatusSync('success', 'Conectado');
            atualizarStatusBanco(); // Se você tiver essa função
        } else {
            throw new Error('Erro na conexão');
        }
    } catch (error) {
        console.error('Erro ao testar conexão:', error);
        mostrarToast('Erro ao conectar com o banco de dados!', 'error');
        atualizarStatusSync('error', 'Erro na conexão');
    }
}


async function sincronizarManual() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    try {
        atualizarStatusSync('syncing', 'Sincronizando manualmente...');
        await sincronizarComServidor();
        mostrarToast('Sincronização manual concluída!');
        atualizarStatusBanco();
    } catch (error) {
        console.error('Erro na sincronização manual:', error);
    }
}

async function forcarUpload() {
    if (!usuarioLogado || usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }
    if (!confirm('Forçar upload dos dados locais para a nuvem?\n\nIsso pode sobrescrever dados na nuvem.')) return;

    try {
        atualizarStatusSync('syncing', 'Enviando dados para nuvem...');
        const sucesso = await salvarNaNuvem();

        if (sucesso) {
            // salvarNaNuvem() já atualiza versaoLocalVar e ultimaSincronizacaoVar internamente
            ultimaSincronizacaoVar = new Date().toISOString();

            // por segurança, recarrega os dados da nuvem para garantir versão atualizada
            const dadosNuvem = await carregarDaNuvem();
            if (dadosNuvem && typeof dadosNuvem.versao !== 'undefined') {
                versaoLocalVar = dadosNuvem.versao;
            }

            mostrarToast('Dados enviados para a nuvem com sucesso!');
            atualizarStatusBanco();
        } else {
            mostrarToast('Erro ao enviar dados para a nuvem!', 'error');
        }
    } catch (error) {
        console.error('Erro no upload forçado:', error);
        mostrarToast('Erro ao enviar dados!', 'error');
        atualizarStatusSync('error', 'Erro no upload');
    }
}

async function forcarDownload() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    if (!confirm('Forçar download dos dados da nuvem?\n\nIsso pode sobrescrever dados locais.')) {
        return;
    }

    try {
        atualizarStatusSync('syncing', 'Baixando dados da nuvem...');
        const dadosNuvem = await carregarDaNuvem();

        if (dadosNuvem) {
            ordensServico = dadosNuvem.ordensServico || [];
            tecnicos = dadosNuvem.tecnicos || [];
            usuarios = dadosNuvem.usuarios || [
                { id: 1, usuario: 'admin', senha: 'admin123', nome: 'Administrador', tipo: 'admin' }
            ];
            proximoId = dadosNuvem.proximoId || 1;

            localStorage.setItem('ultimaSincronizacao', new Date().toISOString());

            // Atualizar interface
            atualizarDashboard();
            carregarListaOS();
            carregarTecnicos();
            carregarConfiguracoes();

            mostrarToast('Dados baixados da nuvem com sucesso!');
            atualizarStatusBanco();
        } else {
            mostrarToast('Nenhum dado encontrado na nuvem!', 'error');
        }
    } catch (error) {
        console.error('Erro no download forçado:', error);
        mostrarToast('Erro ao baixar dados da nuvem!', 'error');
    }
}

function atualizarInformacoesPessoais() {
    // Atualizar perfil
    const perfilNome = document.getElementById('perfilNome');
    const perfilTipo = document.getElementById('perfilTipo');
    const perfilLogin = document.getElementById('perfilLogin');
    const perfilIcone = document.getElementById('perfilIcone');

    if (perfilNome) perfilNome.textContent = usuarioLogado.nome;
    if (perfilTipo) perfilTipo.textContent = getTipoUsuarioTexto(usuarioLogado.tipo);
    if (perfilLogin) perfilLogin.textContent = `Login: ${usuarioLogado.usuario}`;

    // Atualizar ícone/foto baseado no perfil do usuário
    if (perfilIcone) {
        if (usuarioLogado.fotoPerfil) {
            perfilIcone.innerHTML = `<img src="${usuarioLogado.fotoPerfil}" alt="Foto do perfil" class="w-full h-full object-cover rounded-full">`;
        } else {
            const icone = usuarioLogado.tipo === 'admin' ? '👑' :
                usuarioLogado.tipo === 'funcionario' ? '👨‍💼' : '🔧';
            perfilIcone.innerHTML = icone;
        }
    }

    // Atualizar estatísticas pessoais
    const estatisticas = document.getElementById('minhasEstatisticas');
    if (estatisticas) {
        let osComoSolicitante = 0;
        let osComoTecnico = 0;
        let osConcluidas = 0;

        if (usuarioLogado.tipo === 'funcionario' || usuarioLogado.tipo === 'admin') {
            osComoSolicitante = ordensServico.filter(os => os.criadoPor === usuarioLogado.nome).length;
        }

        if (usuarioLogado.tipo === 'mecanico') {
            const tecnicoLogado = tecnicos.find(t => t.usuario === usuarioLogado.usuario);
            if (tecnicoLogado) {
                osComoTecnico = ordensServico.filter(os => os.tecnicoId === tecnicoLogado.id).length;
                osConcluidas = ordensServico.filter(os => os.tecnicoId === tecnicoLogado.id && os.status === 'concluida').length;
            }
        }

        let estatisticasHTML = '';

        if (usuarioLogado.tipo === 'admin') {
            estatisticasHTML = `
                        <div class="text-center">
                            <div class="font-bold text-blue-600 text-xl">${ordensServico.length}</div>
                            <div class="text-white-800">Total de OS</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-green-600 text-xl">${usuarios.length}</div>
                            <div class="text-gray-600">Usuários</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-purple-600 text-xl">${tecnicos.length}</div>
                            <div class="text-gray-600">Técnicos</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-orange-600 text-xl">${osComoSolicitante}</div>
                            <div class="text-gray-600">OS Criadas</div>
                        </div>
                    `;
        } else if (usuarioLogado.tipo === 'funcionario') {
            estatisticasHTML = `
                        <div class="text-center">
                            <div class="font-bold text-blue-600 text-xl">${osComoSolicitante}</div>
                            <div class="text-gray-600">OS Criadas</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-green-600 text-xl">${ordensServico.filter(os => os.criadoPor === usuarioLogado.nome && os.status === 'concluida').length}</div>
                            <div class="text-gray-600">Concluídas</div>
                        </div>
                    `;
        } else if (usuarioLogado.tipo === 'mecanico') {
            estatisticasHTML = `
                        <div class="text-center">
                            <div class="font-bold text-blue-600 text-xl">${osComoTecnico}</div>
                            <div class="text-gray-600">OS Atribuídas</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-green-600 text-xl">${osConcluidas}</div>
                            <div class="text-gray-600">Concluídas</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-orange-600 text-xl">${ordensServico.filter(os => os.tecnicoId === tecnicos.find(t => t.usuario === usuarioLogado.usuario)?.id && os.status === 'andamento').length}</div>
                            <div class="text-gray-600">Em Andamento</div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold text-red-600 text-xl">${ordensServico.filter(os => os.tecnicoId === tecnicos.find(t => t.usuario === usuarioLogado.usuario)?.id && os.status === 'pendente').length}</div>
                            <div class="text-gray-600">Pendentes</div>
                        </div>
                    `;
        }

        estatisticas.innerHTML = estatisticasHTML;
    }

    // Atualizar informações do técnico
    const infoTecnicoContainer = document.getElementById('infoTecnicoContainer');
    const infoTecnico = document.getElementById('infoTecnico');

    if (usuarioLogado.tipo === 'mecanico') {
        if (infoTecnicoContainer) infoTecnicoContainer.style.display = 'block';

        if (infoTecnico) {
            const tecnicoLogado = tecnicos.find(t => t.usuario === usuarioLogado.usuario);
            if (tecnicoLogado) {
                infoTecnico.innerHTML = `
                            <div><strong>Especialidade:</strong> ${tecnicoLogado.especialidade}</div>
                            <div><strong>ID do Técnico:</strong> ${tecnicoLogado.id}</div>
                            <div class="mt-2 text-xs text-gray-500">
                                Você está vinculado como técnico no sistema e pode executar ordens de serviço.
                            </div>
                        `;
            } else {
                infoTecnico.innerHTML = `
                            <div class="text-orange-600">
                                <i class="fas fa-exclamation-triangle mr-2"></i>
                                Usuário mecânico não vinculado a um técnico.
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                Entre em contato com o administrador para vincular sua conta.
                            </div>
                        `;
            }
        }
    } else {
        if (infoTecnicoContainer) infoTecnicoContainer.style.display = 'none';
    }
}

function editarMeuPerfil() {
    // Preencher dados atuais no modal
    document.getElementById('editarNomePerfil').value = usuarioLogado.nome;
    document.getElementById('editarUsuarioPerfil').value = usuarioLogado.usuario;
    document.getElementById('editarTipoPerfil').value = getTipoUsuarioTexto(usuarioLogado.tipo);

    // Carregar foto atual se existir
    const previewFoto = document.getElementById('previewFotoPerfil');
    if (usuarioLogado.fotoPerfil) {
        previewFoto.innerHTML = `<img src="${usuarioLogado.fotoPerfil}" alt="Foto do perfil" class="w-full h-full object-cover rounded-full">`;
    } else {
        const icone = usuarioLogado.tipo === 'admin' ? '👑' :
            usuarioLogado.tipo === 'funcionario' ? '👨‍💼' : '🔧';
        previewFoto.innerHTML = icone;
    }

    document.getElementById('modalEditarPerfil').classList.remove('hidden');
}

function fecharModalEditarPerfil() {
    document.getElementById('modalEditarPerfil').classList.add('hidden');
    document.getElementById('editarPerfilForm').reset();
}

function previewFoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const previewFoto = document.getElementById('previewFotoPerfil');
            previewFoto.innerHTML = `<img src="${e.target.result}" alt="Preview" class="w-full h-full object-cover rounded-full">`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function removerFotoPerfil() {
    const previewFoto = document.getElementById('previewFotoPerfil');
    const icone = usuarioLogado.tipo === 'admin' ? '👑' :
        usuarioLogado.tipo === 'funcionario' ? '👨‍💼' : '🔧';
    previewFoto.innerHTML = icone;
    document.getElementById('inputFotoPerfil').value = '';
}

document.getElementById('editarPerfilForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const novoNome = document.getElementById('editarNomePerfil').value;
    const inputFoto = document.getElementById('inputFotoPerfil');

    // Atualizar nome
    const usuarioIndex = usuarios.findIndex(u => u.id === usuarioLogado.id);
    if (usuarioIndex !== -1) {
        usuarios[usuarioIndex].nome = novoNome;
        usuarios[usuarioIndex].perfilAtualizado = new Date().toISOString();
        usuarioLogado.nome = novoNome;

        // Atualizar foto se foi selecionada
        if (inputFoto.files && inputFoto.files[0]) {
            const reader = new FileReader();
            reader.onload = function (e) {
                usuarios[usuarioIndex].fotoPerfil = e.target.result;
                usuarioLogado.fotoPerfil = e.target.result;

                localStorage.setItem('usuarios', JSON.stringify(usuarios));
                localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

                atualizarInformacoesPessoais();
                atualizarFotoHeader();
                fecharModalEditarPerfil();
                mostrarToast('Perfil atualizado com sucesso!');
            };
            reader.readAsDataURL(inputFoto.files[0]);
        } else {
            // Se não há nova foto, verificar se deve remover a atual
            const previewFoto = document.getElementById('previewFotoPerfil');
            if (!previewFoto.querySelector('img')) {
                usuarios[usuarioIndex].fotoPerfil = null;
                usuarioLogado.fotoPerfil = null;
            }

            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

            atualizarInformacoesPessoais();
            atualizarFotoHeader();
            fecharModalEditarPerfil();
            mostrarToast('Perfil atualizado com sucesso!');
        }
    } else {
        mostrarToast('Erro ao atualizar perfil!', 'error');
    }
});

function atualizarFotoHeader() {
    // Atualizar informações do usuário no header se necessário
    document.getElementById('userInfo').textContent = usuarioLogado.nome;
}

function alterarMinhaSenha() {
    const senhaAtual = prompt('Digite sua senha atual:');
    if (!senhaAtual) return;

    if (senhaAtual !== usuarioLogado.senha) {
        mostrarToast('Senha atual incorreta!', 'error');
        return;
    }

    const novaSenha = prompt('Digite a nova senha:');
    if (!novaSenha) return;

    if (novaSenha.length < 3) {
        mostrarToast('A nova senha deve ter pelo menos 3 caracteres!', 'error');
        return;
    }

    const confirmarSenha = prompt('Confirme a nova senha:');
    if (novaSenha !== confirmarSenha) {
        mostrarToast('As senhas não coincidem!', 'error');
        return;
    }

    // Atualizar senha no array de usuários
    const usuarioIndex = usuarios.findIndex(u => u.id === usuarioLogado.id);
    if (usuarioIndex !== -1) {
        usuarios[usuarioIndex].senha = novaSenha;
        usuarios[usuarioIndex].senhaAlterada = new Date().toISOString();
        usuarioLogado.senha = novaSenha;

        salvarDados();
        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

        mostrarToast('Senha alterada com sucesso!');
    } else {
        mostrarToast('Erro ao alterar senha!', 'error');
    }
}

function carregarListaUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    if (!lista) return;

    lista.innerHTML = '';

    // Filtrar usuários (não mostrar admin para não-admins)
    let usuariosParaMostrar = usuarios;
    if (usuarioLogado.tipo !== 'admin') {
        usuariosParaMostrar = usuarios.filter(u => u.tipo !== 'admin');
    }

    usuariosParaMostrar.forEach(usuario => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';

        // Escolher ícone ou foto de perfil
        let iconeHtml = '';
        if (usuario.fotoPerfil) {
            iconeHtml = `<img src="${usuario.fotoPerfil}" alt="Foto" class="w-8 h-8 rounded-full object-cover inline-block mr-2">`;
        } else {
            const icone = usuario.tipo === 'admin' ? '👑' :
                usuario.tipo === 'funcionario' ? '👨‍💼' : '🔧';
            iconeHtml = `<span class="mr-2">${icone}</span>`;
        }

        // Status do usuário
        const statusHtml = usuario.ativo
            ? `<span class="text-green-600 text-xs">Ativo</span>`
            : `<span class="text-yellow-600 text-xs">Pendente</span>`;

        // Ações
        let acoesHtml = '';
        if (usuarioLogado.tipo === 'admin' && usuario.tipo !== 'admin') {
            if (!usuario.ativo) {
                // 🔹 Botões de Aceitar/Recusar só aparecem para usuários pendentes
                acoesHtml += `
                    <button onclick="aceitarUsuario(${usuario.id})"
                        class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs" title="Aceitar Usuário">
                        <i class="fas fa-check"></i>
                    </button>
                    <button onclick="recusarUsuario(${usuario.id})"
                        class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs" title="Recusar Usuário">
                        <i class="fas fa-times"></i>
                    </button>
                `;
            } else {
                // 🔹 Mostra ações normais para usuários já ativos
                acoesHtml += `
                    <select onchange="alterarTipoUsuario(${usuario.id}, this.value)" class="text-xs border border-gray-300 rounded px-2 py-1">
                        <option value="">Alterar tipo</option>
                        <option value="funcionario" ${usuario.tipo === 'funcionario' ? 'selected' : ''}>👨‍💼 Funcionário</option>
                        <option value="mecanico" ${usuario.tipo === 'mecanico' ? 'selected' : ''}>🔧 Mecânico</option>
                    </select>
                    <button onclick="resetarSenhaUsuario(${usuario.id})" 
                        class="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs" title="Resetar Senha">
                        <i class="fas fa-key"></i>
                    </button>
                    ${usuario.id !== usuarioLogado.id ? `
                        <button onclick="removerUsuario(${usuario.id})"
                            class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs" title="Remover Usuário">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                `;
            }
        }

        div.innerHTML = `
            <div class="flex-1">
                <div class="font-medium flex items-center">${iconeHtml}${usuario.nome}</div>
                <div class="text-sm text-gray-500">${usuario.usuario} - ${getTipoUsuarioTexto(usuario.tipo)}</div>
                ${statusHtml}
                ${usuario.dataUltimoCadastro
                ? `<div class="text-xs text-gray-500">Criado em: ${new Date(usuario.dataUltimoCadastro).toLocaleDateString('pt-BR')}</div>`
                : ''}
            </div>
            <div class="flex flex-wrap gap-1">${acoesHtml}</div>
        `;

        lista.appendChild(div);
    });
}

function aceitarUsuario(id) {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;
    usuario.ativo = true;
    salvarDados();
    carregarListaUsuarios();
    mostrarToast(`${usuario.nome} foi aprovado!`, 'success');
}

function recusarUsuario(id) {
    if (!confirm('Tem certeza que deseja recusar este usuário?')) return;
    usuarios = usuarios.filter(u => u.id !== id);
    salvarDados();
    carregarListaUsuarios();
    mostrarToast('Usuário recusado!', 'error');
}

function carregarListaTecnicos() {
    const lista = document.getElementById('listaTecnicos');
    if (!lista) return;

    lista.innerHTML = '';

    tecnicos.forEach(tecnico => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';

        const usuarioVinculado = tecnico.usuario ?
            usuarios.find(u => u.usuario === tecnico.usuario) : null;

        div.innerHTML = `
                    <div>
                        <div class="font-medium">🔧 ${tecnico.nome}</div>
                        <div class="text-sm text-gray-500">${tecnico.especialidade}</div>
                        ${usuarioVinculado ?
                `<div class="text-xs text-blue-600">Usuário: ${usuarioVinculado.nome}</div>` :
                '<div class="text-xs text-gray-400">Sem usuário vinculado</div>'
            }
                    </div>
                    <button onclick="removerTecnico(${tecnico.id})" class="text-red-500 hover:text-red-700 p-2">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
        lista.appendChild(div);
    });
}

function alterarTipoUsuario(id, novoTipo) {
    if (!novoTipo) return;

    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;

    const tipoAnterior = usuario.tipo;
    const nomeNovoTipo = getTipoUsuarioTexto(novoTipo);

    if (confirm(`Alterar "${usuario.nome}" de ${getTipoUsuarioTexto(tipoAnterior)} para ${nomeNovoTipo}?`)) {
        usuario.tipo = novoTipo;
        usuario.dataAlteracao = new Date().toISOString();
        salvarDados();
        carregarListaUsuarios();
        mostrarToast(`${usuario.nome} alterado para ${nomeNovoTipo}!`);
    } else {
        // Recarregar a lista para resetar o select
        carregarListaUsuarios();
    }
}

function removerUsuario(id) {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;

    // Verificar se não é o próprio usuário logado
    if (usuario.id === usuarioLogado.id) {
        mostrarToast('Você não pode remover sua própria conta!', 'error');
        return;
    }

    // Verificar se não é admin (proteção extra)
    if (usuario.tipo === 'admin') {
        mostrarToast('Não é possível remover administradores!', 'error');
        return;
    }

    if (confirm(`Remover o usuário "${usuario.nome}"?\n\nEsta ação não pode ser desfeita.`)) {
        // Remover usuário
        usuarios = usuarios.filter(u => u.id !== id);

        // Se o usuário era mecânico, remover também da lista de técnicos se estiver vinculado
        if (usuario.tipo === 'mecanico') {
            const tecnicoVinculado = tecnicos.find(t => t.usuario === usuario.usuario);
            if (tecnicoVinculado) {
                if (confirm(`O usuário "${usuario.nome}" estava vinculado ao técnico "${tecnicoVinculado.nome}". Deseja remover também o técnico?`)) {
                    tecnicos = tecnicos.filter(t => t.id !== tecnicoVinculado.id);
                    carregarTecnicos();
                    carregarListaTecnicos();
                } else {
                    // Apenas desvincular
                    tecnicoVinculado.usuario = null;
                }
            }
        }

        salvarDados();

        carregarListaUsuarios();
        mostrarToast('Usuário removido com sucesso!');
    }
}

function resetarSenhaUsuario(id) {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;

    const novaSenha = prompt(`Resetar senha de "${usuario.nome}"?\n\nDigite a nova senha:`);
    if (novaSenha && novaSenha.length >= 3) {
        usuario.senha = novaSenha;
        usuario.senhaResetada = new Date().toISOString();
        salvarDados();
        mostrarToast(`Senha de ${usuario.nome} resetada!`);
    } else if (novaSenha) {
        mostrarToast('Senha deve ter pelo menos 3 caracteres!', 'error');
    }
}

function verHistoricoUsuario(id) {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;

    let historico = `HISTÓRICO DO USUÁRIO: ${usuario.nome}\n\n`;
    historico += `Tipo atual: ${getTipoUsuarioTexto(usuario.tipo)}\n`;
    historico += `Login: ${usuario.usuario}\n\n`;

    if (usuario.dataUltimoCadastro) {
        historico += `Criado em: ${new Date(usuario.dataUltimoCadastro).toLocaleString('pt-BR')}\n`;
    }
    if (usuario.dataPromocao) {
        historico += `Promovido em: ${new Date(usuario.dataPromocao).toLocaleString('pt-BR')}\n`;
    }
    if (usuario.dataAlteracao) {
        historico += `Alterado em: ${new Date(usuario.dataAlteracao).toLocaleString('pt-BR')}\n`;
    }
    if (usuario.senhaResetada) {
        historico += `Senha resetada em: ${new Date(usuario.senhaResetada).toLocaleString('pt-BR')}\n`;
    }

    // Contar OS relacionadas
    const osComoSolicitante = ordensServico.filter(os => os.criadoPor === usuario.nome).length;
    const tecnicoVinculado = tecnicos.find(t => t.usuario === usuario.usuario);
    const osComoTecnico = tecnicoVinculado ? ordensServico.filter(os => os.tecnicoId === tecnicoVinculado.id).length : 0;

    historico += `\nESTATÍSTICAS:\n`;
    historico += `OS criadas: ${osComoSolicitante}\n`;
    if (osComoTecnico > 0) {
        historico += `OS executadas: ${osComoTecnico}\n`;
    }

    alert(historico);
}

function removerTecnico(id) {
    const tecnico = tecnicos.find(t => t.id === id);
    if (!tecnico) return;

    if (confirm(`Remover o técnico "${tecnico.nome}"?`)) {
        tecnicos = tecnicos.filter(t => t.id !== id);
        salvarDados();
        carregarTecnicos();
        carregarListaTecnicos();
        mostrarToast('Técnico removido!');
    }
}

function atualizarProximoNumero() {
    const proximoNum = proximoId.toString().padStart(3, '0');
    const elemento = document.getElementById('proximoNumeroOS');
    if (elemento) {
        elemento.textContent = `#${proximoNum}`;
    }
}

function proximoStep() {
    if (validarStepAtual()) {
        if (currentStep < totalSteps) {
            currentStep++;
            atualizarStep();
        }
    }
}

function anteriorStep() {
    if (currentStep > 1) {
        currentStep--;
        atualizarStep();
    }
}

function irParaStep(step) {
    if (step >= 1 && step <= totalSteps) {
        currentStep = step;
        atualizarStep();
    }
}

function atualizarStep() {
    // Esconder todos os steps
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active');
    });

    // Mostrar step atual
    document.getElementById(`step${currentStep}`).classList.add('active');

    // Atualizar navegação
    document.querySelectorAll('.step-nav').forEach((nav, index) => {
        const stepNum = index + 1;
        const circle = nav.querySelector('.w-8');

        nav.classList.remove('active', 'completed');

        if (stepNum === currentStep) {
            nav.classList.add('active');
        } else if (stepNum < currentStep) {
            nav.classList.add('completed');
            circle.innerHTML = '<i class="fas fa-check text-sm"></i>';
        } else {
            circle.textContent = stepNum;
        }
    });

    // Atualizar progress bar
    const progress = (currentStep / totalSteps) * 100;
    document.getElementById('progressBar').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `${currentStep} de ${totalSteps}`;

    // Atualizar botões
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProximo = document.getElementById('btnProximo');
    const btnFinalizar = document.getElementById('btnFinalizar');

    btnAnterior.style.display = currentStep === 1 ? 'none' : 'flex';
    btnProximo.style.display = currentStep === totalSteps ? 'none' : 'flex';
    btnFinalizar.style.display = currentStep === totalSteps ? 'flex' : 'none';

    // Atualizar resumo no último step
    if (currentStep === totalSteps) {
        atualizarResumo();
    }
    
}

function validarStepAtual() {
    const step = document.getElementById(`step${currentStep}`);
    const inputs = step.querySelectorAll('input[required], select[required], textarea[required]');

    let valido = true;
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.focus();
            input.classList.add('border-red-500');
            setTimeout(() => input.classList.remove('border-red-500'), 3000);
            valido = false;
            return false;
        }
    });

    if (!valido) {
        mostrarToast('Preencha todos os campos obrigatórios!', 'error');
    }

    return valido;
}

function atualizarResumo() {
    const resumo = document.getElementById('resumoOS');
    const solicitante = document.getElementById('solicitante').value;
    const setor = document.getElementById('setor').value;
    const equipamento = document.getElementById('equipamento').value;
    const localizacao = document.getElementById('localizacao').value;
    const tipoServico = document.getElementById('tipoServico').value;
    const tecnicoId = document.getElementById('tecnico').value;
    const prioridade = document.getElementById('prioridade').value;
    const descricao = document.getElementById('descricao').value;

    const tecnico = tecnicos.find(t => t.id == tecnicoId);

    resumo.innerHTML = `
                <div class="resumo-item">
                    <strong>Solicitante:</strong> ${solicitante} (${setor})
                </div>
                <div class="resumo-item">
                    <strong>Equipamento:</strong> ${equipamento} - ${localizacao}
                </div>
                <div class="resumo-item">
                    <strong>Tipo de Serviço:</strong> ${tipoServico}
                </div>
                <div class="resumo-item">
                    <strong>Técnico:</strong> ${tecnico ? tecnico.nome : 'Não selecionado'}
                </div>
                <div class="resumo-item">
                    <strong>Prioridade:</strong> ${getPriorityText(prioridade)}
                </div>
                <div class="resumo-item">
                    <strong>Descrição:</strong> ${descricao.substring(0, 100)}${descricao.length > 100 ? '...' : ''}
                </div>
            `;
}

document.addEventListener('DOMContentLoaded', function () {
    // Navegação por clique nos steps
    document.querySelectorAll('.step-nav').forEach((nav, index) => {
        nav.addEventListener('click', () => {
            const targetStep = index + 1;
            if (targetStep <= currentStep || validarStepsAnteriores(targetStep)) {
                irParaStep(targetStep);
            }
        });
    });

    // Atualizar próximo número quando a tab for aberta
    atualizarProximoNumero();
});

function validarStepsAnteriores(targetStep) {
    for (let i = 1; i < targetStep; i++) {
        const step = document.getElementById(`step${i}`);
        const inputs = step.querySelectorAll('input[required], select[required], textarea[required]');

        for (let input of inputs) {
            if (!input.value.trim()) {
                mostrarToast(`Complete o Step ${i} primeiro!`, 'error');
                return false;
            }
        }
    }
    return true;
}

// Carregar dados salvos ao abrir a página
window.addEventListener('load', () => {
    const savedData = localStorage.getItem('osFormData');
    if (savedData) {
        const data = JSON.parse(savedData);
        document.getElementById('solicitante').value = data.solicitante || '';
        document.getElementById('setor').value = data.setor || '';
        document.getElementById('equipamento').value = data.equipamento || '';
        document.getElementById('localizacao').value = data.localizacao || '';
        document.getElementById('tipoServico').value = data.tipoServico || '';
        document.getElementById('tecnico').value = data.tecnico || '';
        document.getElementById('prioridade').value = data.prioridade || 'media';
        document.getElementById('descricao').value = data.descricao || '';
        document.getElementById('materiais').value = data.materiais || '';
        document.getElementById('observacoes').value = data.observacoes || '';
        document.getElementById('contatoSolicitante').value = data.contatoSolicitante || '';
        document.getElementById('numeroSerie').value = data.numeroSerie || '';
    }
});

// Salvar formulário no localStorage sempre que o usuário digitar algo
document.getElementById('osForm').addEventListener('input', () => {
    const formData = {
        solicitante: document.getElementById('solicitante').value,
        setor: document.getElementById('setor').value,
        equipamento: document.getElementById('equipamento').value,
        localizacao: document.getElementById('localizacao').value,
        tipoServico: document.getElementById('tipoServico').value,
        tecnico: document.getElementById('tecnico').value,
        prioridade: document.getElementById('prioridade').value,
        descricao: document.getElementById('descricao').value,
        materiais: document.getElementById('materiais').value,
        observacoes: document.getElementById('observacoes').value,
        contatoSolicitante: document.getElementById('contatoSolicitante').value,
        numeroSerie: document.getElementById('numeroSerie').value
    };
    localStorage.setItem('osFormData', JSON.stringify(formData));
});

// Submissão do formulário
document.getElementById('osForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const tecnicoId = parseInt(document.getElementById('tecnico').value);
    const tecnicoSelect = document.getElementById('tecnico');

    const novaOS = {
        id: proximoId++,
        solicitante: document.getElementById('solicitante').value,
        setor: document.getElementById('setor').value,
        equipamento: document.getElementById('equipamento').value,
        localizacao: document.getElementById('localizacao').value,
        tipoServico: document.getElementById('tipoServico').value,
        tecnicoId: tecnicoId,
        tecnicoNome: tecnicoSelect.selectedOptions[0]?.textContent || null,
        prioridade: document.getElementById('prioridade').value,
        descricao: document.getElementById('descricao').value,
        materiais: document.getElementById('materiais').value,
        observacoes: document.getElementById('observacoes').value,
        contatoSolicitante: document.getElementById('contatoSolicitante').value,
        numeroSerie: document.getElementById('numeroSerie').value,
        status: 'pendente',
        dataAbertura: new Date().toISOString(),
        dataInicio: null,
        dataConclusao: null,
        relatorioServico: null,
        materiaisUtilizados: null,
        observacoesFinais: null,
        criadoPor: usuarioLogado.nome
    };

    ordensServico.push(novaOS);
    salvarDados();

    mostrarToast(`OS #${novaOS.id} criada com sucesso!`, 'success');

    // 📌 Redirecionamento por tipo de usuário
    if (usuarioLogado.tipo === 'admin') {
        atualizarDashboard();
        atualizarGraficos();
        showTab('dashboard');
    } else if (usuarioLogado.tipo === 'mecanico') {
        carregarMinhasOS();
        showTab('mecanico');
    } else if (usuarioLogado.tipo === 'funcionario') {
        currentStep = 1;
        atualizarStep();
        atualizarProximoNumero();
        showTab('nova');
    }
});


function atualizarDashboard() {
    let osParaContar = ordensServico;

    // Se for mecânico, mostrar apenas suas OS
    if (usuarioLogado.tipo === 'mecanico') {
        const tecnicoLogado = tecnicos.find(t => t.usuario === usuarioLogado.usuario);
        if (tecnicoLogado) {
            osParaContar = ordensServico.filter(os => os.tecnicoId === tecnicoLogado.id);
        }
    }

    const total = osParaContar.length;
    const concluidas = osParaContar.filter(os => os.status === 'concluida').length;
    const andamento = osParaContar.filter(os => os.status === 'andamento').length;
    const pendentes = osParaContar.filter(os => os.status === 'pendente').length;

    document.getElementById('totalOS').textContent = total;
    document.getElementById('concluidasOS').textContent = concluidas;
    document.getElementById('andamentoOS').textContent = andamento;
    document.getElementById('pendentesOS').textContent = pendentes;

    // Atualizar percentuais
    const percentualConcluidas = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    const percentualAndamento = total > 0 ? Math.round((andamento / total) * 100) : 0;
    const percentualPendentes = total > 0 ? Math.round((pendentes / total) * 100) : 0;

    const elemPercentualConcluidas = document.getElementById('percentualConcluidas');
    const elemPercentualAndamento = document.getElementById('percentualAndamento');
    const elemPercentualPendentes = document.getElementById('percentualPendentes');

    if (elemPercentualConcluidas) elemPercentualConcluidas.textContent = `${percentualConcluidas}%`;
    if (elemPercentualAndamento) elemPercentualAndamento.textContent = `${percentualAndamento}%`;
    if (elemPercentualPendentes) elemPercentualPendentes.textContent = `${percentualPendentes}%`;

    // OS Recentes
    const osRecentes = osParaContar
        .sort((a, b) => new Date(b.dataAbertura) - new Date(a.dataAbertura))
        .slice(0, 5);

    const containerRecentes = document.getElementById('osRecentes');
    containerRecentes.innerHTML = '';

    if (osRecentes.length === 0) {
        containerRecentes.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhuma OS encontrada</p>';
    } else {
        osRecentes.forEach(os => {
            const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg card-hover cursor-pointer';
            div.onclick = () => verDetalhes(os.id);
            div.innerHTML = `
                        <div class="flex-1">
                            <div class="flex items-center mb-1">
                                <span class="font-medium text-gray-900">#${os.id}</span>
                                <span class="ml-2 px-2 py-1 text-xs rounded-full status-${os.status}">${getStatusText(os.status)}</span>
                                <span class="ml-2 px-2 py-1 text-xs rounded-full priority-${os.prioridade}">${getPriorityIcon(os.prioridade)}</span>
                            </div>
                            <div class="text-sm text-gray-600">${os.solicitante} - ${os.setor}</div>
                            <div class="text-xs text-gray-500">${tecnico ? tecnico.nome : 'Sem técnico'}</div>
                        </div>
                        <i class="fas fa-chevron-right text-gray-400"></i>
                        
                    `;
            containerRecentes.appendChild(div);
        });
    }

    // OS Urgentes
    const osUrgentes = osParaContar.filter(os => os.prioridade === 'urgente' && os.status !== 'concluida');
    const containerUrgentes = document.getElementById('osUrgentes');
    const contadorUrgentes = document.getElementById('contadorUrgentes');

    if (contadorUrgentes) {
        contadorUrgentes.textContent = osUrgentes.length;
    }

    containerUrgentes.innerHTML = '';

    if (osUrgentes.length === 0) {
        containerUrgentes.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhuma OS urgente</p>';
    } else {
        osUrgentes.forEach(os => {
            const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg card-hover cursor-pointer';
            div.onclick = () => verDetalhes(os.id);
            div.innerHTML = `
                        <div class="flex-1">
                            <div class="font-medium text-red-800">#${os.id} - ${os.solicitante}</div>
                            <div class="text-sm text-red-600">${os.setor} | ${tecnico ? tecnico.nome : 'Sem técnico'}</div>
                        </div>
                        <i class="fas fa-chevron-right text-red-400"></i>
                    `;
            containerUrgentes.appendChild(div);
        });
    }

    // Atualizar gráficos se for admin
    if (usuarioLogado.tipo === 'admin') {
        setTimeout(() => atualizarGraficos(), 100);
    }
}

function carregarListaOS() {
    const container = document.getElementById('listaOS');
    if (!container) return;

    // copia segura do array de ordens para não mutar o original
    let osFiltradas = Array.isArray(ordensServico) ? [...ordensServico] : [];

    // Se for mecânico, mostrar apenas suas OS
    if (usuarioLogado && usuarioLogado.tipo === 'mecanico') {
        const tecnicoLogado = tecnicos.find(t => t.usuario === usuarioLogado.usuario);
        if (tecnicoLogado) {
            osFiltradas = osFiltradas.filter(os => os.tecnicoId === tecnicoLogado.id);
        }
    }

    // Aplicar filtros
    const filtroStatus = document.getElementById('filtroStatus')?.value || '';
    const filtroPrioridade = document.getElementById('filtroPrioridade')?.value || '';
    const filtroBusca = (document.getElementById('filtroBusca')?.value || '').toLowerCase();

    if (filtroStatus) {
        osFiltradas = osFiltradas.filter(os => os.status === filtroStatus);
    }

    if (filtroPrioridade) {
        osFiltradas = osFiltradas.filter(os => os.prioridade === filtroPrioridade);
    }

    if (filtroBusca) {
        osFiltradas = osFiltradas.filter(os =>
            (os.solicitante || '').toLowerCase().includes(filtroBusca) ||
            (os.setor || '').toLowerCase().includes(filtroBusca) ||
            (os.equipamento || '').toLowerCase().includes(filtroBusca) ||
            os.id.toString().includes(filtroBusca)
        );
    }

    // Ordenar por data (mais recentes primeiro)
    osFiltradas.sort((a, b) => new Date(b.dataAbertura) - new Date(a.dataAbertura));


    container.innerHTML = '';

    if (osFiltradas.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Nenhuma OS encontrada</p>';
        return;
    }

    osFiltradas.forEach(os => {
        // --- renderização (preservei sua lógica original) ---
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-lg p-4 card-hover';

        const acoes = getAcoesOS(os);
        div.innerHTML = `
    <div class="relative bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden mb-8 mx-2">
        <!-- Header com gradiente personalizado -->
        <div class="px-6 py-4 border-b border-gray-100" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
            <div class="flex items-start justify-between">
                <div class="flex items-center space-x-3">
                    <!-- ID com gradiente personalizado mais escuro -->
                    <div class="text-white px-3 py-1 rounded-lg font-bold text-lg shadow-md bg-black bg-opacity-20 backdrop-blur-sm border border-white border-opacity-20">
                        #${os.id}
                    </div>
                    
                    <!-- Status com animação -->
                    <div class="relative">
                        <span class="px-3 py-1.5 text-xs font-semibold rounded-full status-${os.status} shadow-sm transform hover:scale-105 transition-transform duration-200 bg-white bg-opacity-90">
                            ${getStatusText(os.status)}
                        </span>
                        <div class="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse status-indicator-${os.status}"></div>
                    </div>
                    
                    <!-- Prioridade com ícone melhorado -->
                    <div class="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-full priority-${os.prioridade} shadow-sm bg-white bg-opacity-90">
                        <span class="text-sm">${getPriorityIcon(os.prioridade)}</span>
                    </div>
                </div>
                
                <!-- Botão de detalhes melhorado -->
                <button onclick="verDetalhes(${os.id})" class="group relative bg-white bg-opacity-20 hover:bg-opacity-30 text-white hover:text-blue-100 p-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 border border-white border-opacity-30 backdrop-blur-sm">
                    <i class="fas fa-eye text-lg group-hover:scale-110 transition-transform duration-200"></i>
                    <div class="absolute -top-2 -right-2 w-2 h-2 bg-yellow-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                </button>
            </div>
        </div>

        <!-- Corpo principal com layout em grid -->
        <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <!-- Coluna esquerda -->
                <div class="space-y-3">
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                            <i class="fas fa-user text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Solicitante</span>
                            <div class="font-semibold text-gray-800">${os.solicitante}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 bg-gradient-to-r from-purple-400 to-purple-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-building text-white text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Setor</span>
                            <div class="font-semibold text-gray-800">${os.setor}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-cogs text-white text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Equipamento</span>
                            <div class="font-semibold text-gray-800">${os.equipamento}</div>
                        </div>
                    </div>
                </div>

                <!-- Coluna direita -->
                <div class="space-y-3">
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-white" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                            <i class="fas fa-wrench text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Técnico</span>
                            <div class="font-semibold text-gray-800">${tecnico ? tecnico.nome : 'Não atribuído'}</div>
                            ${!tecnico ? '<div class="text-xs text-amber-600 font-medium">⚠️ Aguardando atribuição</div>' : ''}
                        </div>
                    </div>
                    
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-calendar text-white text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Data de Abertura</span>
                            <div class="font-semibold text-gray-800">${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}</div>
                        </div>
                    </div>
                    
                    ${os.criadoPor ? `
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                        <div class="w-8 h-8 bg-gradient-to-r from-teal-400 to-teal-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-user-plus text-white text-sm"></i>
                        </div>
                        <div>
                            <span class="text-xs text-gray-500 uppercase tracking-wide font-medium">Criado por</span>
                            <div class="font-semibold text-gray-800">${os.criadoPor}</div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- Linha divisória elegante -->
            <div class="relative mb-6">
                <div class="absolute inset-0 flex items-center">
                    <div class="w-full border-t border-gray-200"></div>
                </div>
            </div>
            ${acoes}

        </div>

        <!-- Indicador de hover com gradiente personalizado -->
        <div class="absolute top-0 left-0 w-full h-1 transform scale-x-0 hover:scale-x-100 transition-transform duration-300 origin-left" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);"></div>
        
        <!-- Sombra interna sutil -->
        <div class="absolute inset-0 rounded-xl ring-1 ring-inset ring-gray-900/5 pointer-events-none"></div>
        
    </div>
    
    <style>
        /* Estilos para status */
        .status-aberto { @apply text-yellow-800 border border-yellow-200; }
        .status-andamento { @apply text-blue-800 border border-blue-200; }
        .status-concluido { @apply text-green-800 border border-green-200; }
        .status-cancelado { @apply text-red-800 border border-red-200; }
        
        /* Indicadores de status animados */
        .status-indicator-aberto { @apply bg-yellow-400; }
        .status-indicator-andamento { @apply bg-blue-400; }
        .status-indicator-concluido { @apply bg-green-400; }
        .status-indicator-cancelado { @apply bg-red-400; }
        
        /* Estilos para prioridade */
        .priority-baixa { @apply text-green-700 border border-green-200; }
        .priority-media { @apply text-yellow-700 border border-yellow-200; }
        .priority-alta { @apply text-orange-700 border border-orange-200; }
        .priority-urgente { @apply text-red-700 border border-red-200; }
        
        /* Animações personalizadas */
        @keyframes pulse-soft {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        
        .animate-pulse-soft {
            animation: pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        /* Efeitos de hover melhorados */
        .hover-lift:hover {
            transform: translateY(-2px);
        }
        
        /* Sombras personalizadas */
        .shadow-custom {
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .shadow-custom-hover:hover {
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
    </style>
`;
        container.appendChild(div);
    });


function getAcoesOS(os) {
    return `
        <div class="max-w-4xl mx-auto">
            <div class="relative mb-6 rounded-2xl p-8">
                <div class="absolute inset-x-8 top-0 flex items-center">
                    <div class="w-full border-t-2 border-gradient-to-r from-blue-200 via-purple-200 to-pink-200"></div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-3 gap-3 pt-6">

                    <!-- Editar button -->
                    <button onclick="editarOSModal(${os.id})"
                        class="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 
                               text-white px-4 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 
                               shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 font-medium
                               w-full text-sm sm:text-base">
                        <i class="fas fa-edit text-sm sm:text-lg"></i>
                        <span class="whitespace-nowrap">Editar OS</span>
                    </button>

                    <!-- Atribuir Técnico button -->
                    <button onclick="atribuirTecnico(${os.id})"
                        class="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 
                               text-white px-4 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 
                               shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 font-medium
                               w-full text-sm sm:text-base">
                        <i class="fas fa-user-plus text-sm sm:text-lg"></i>
                        <span class="whitespace-nowrap">Atribuir Técnico</span>
                    </button>

                    <!-- Excluir button -->
                    <button onclick="excluirOS(${os.id})"
                        class="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 
                               text-white px-4 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 
                               shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 font-medium
                               w-full text-sm sm:text-base">
                        <i class="fas fa-trash text-sm sm:text-lg"></i>
                        <span class="whitespace-nowrap">Excluir OS</span>
                    </button>

                </div>
            </div>
        </div>
    `;
}


}


// Variável global para controlar aba ativa
let abaAtualOS = 'pendente';

// Funções para gradientes coloridos por status
function getCardHeaderGradient(status) {
    const gradientes = {
        'pendente': 'bg-gradient-to-r from-amber-500 to-orange-600',
        'andamento': 'bg-gradient-to-r from-blue-800 to-indigo-900',
        'concluida': 'bg-gradient-to-r from-green-500 to-emerald-600',
        'cancelada': 'bg-gradient-to-r from-red-500 to-rose-600'
    };
    return gradientes[status] || gradientes['pendente'];
}

function getNumberGradient(status) {
    const gradientes = {
        'pendente': 'bg-gradient-to-br from-amber-600 to-orange-700',
        'andamento': 'bg-gradient-to-br from-blue-700 to-indigo-800',
        'concluida': 'bg-gradient-to-br from-green-600 to-emerald-700',
        'cancelada': 'bg-gradient-to-br from-red-600 to-rose-700'
    };
    return gradientes[status] || gradientes['pendente'];
}

function getPriorityGradient(prioridade) {
    const gradientes = {
        'urgente': 'bg-gradient-to-r from-red-600 to-pink-600',
        'alta': 'bg-gradient-to-r from-orange-500 to-red-500',
        'media': 'bg-gradient-to-r from-yellow-500 to-orange-500',
        'baixa': 'bg-gradient-to-r from-green-500 to-teal-500'
    };
    return gradientes[prioridade] || gradientes['media'];
}

function getIconGradient(tipo) {
    const gradientes = {
        'user': 'bg-gradient-to-br from-blue-500 to-purple-600',
        'building': 'bg-gradient-to-br from-purple-500 to-pink-600',
        'cogs': 'bg-gradient-to-br from-orange-500 to-red-600'
    };
    return gradientes[tipo] || gradientes['user'];
}

function getDescriptionGradient(status) {
    const gradientes = {
        'pendente': 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200',
        'andamento': 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200',
        'concluida': 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200',
        'cancelada': 'bg-gradient-to-r from-red-50 to-rose-50 border border-red-200'
    };
    return gradientes[status] || gradientes['pendente'];
}

function carregarMinhasOS(usuarioForcado = null) {
    const container = document.getElementById('minhasOS');
    if (!container) return;

    // Se for admin e escolheu um mecânico, usamos ele
    let tecnicoAlvo;

    if (usuarioForcado) {
        tecnicoAlvo = tecnicos.find(t => t.usuario === usuarioForcado);
    } else {
        tecnicoAlvo = tecnicos.find(t => t.usuario === usuarioLogado.usuario);
    }

    if (!tecnicoAlvo) {
        container.innerHTML = `
            <div class="min-h-96 flex items-center justify-center">
                <div class="text-center max-w-md mx-auto px-6">
                    <div class="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                        <i class="fas fa-user-slash text-white text-3xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">Técnico não encontrado</h3>
                    <p class="text-gray-500">Verifique se o usuário está cadastrado corretamente</p>
                </div>
            </div>
        `;
        return;
    }

    const minhasOS = ordensServico.filter(os => os.tecnicoId === tecnicoAlvo.id);

    if (minhasOS.length === 0) {
        container.innerHTML = `
            <div class="min-h-96 flex items-center justify-center">
                <div class="text-center max-w-md mx-auto px-6">
                    <div class="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                        <i class="fas fa-clipboard-list text-white text-3xl"></i>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">Nenhuma OS atribuída</h3>
                    <p class="text-gray-500">Aguarde novas ordens de serviço serem designadas</p>
                </div>
            </div>
        `;
        return;
    }

    // Agrupar por status
    const grupos = {
        pendente: [],
        andamento: [],
        concluida: [],
        cancelada: []
    };

    minhasOS.forEach(os => {
        const status = os.status || 'pendente';
        if (grupos[status]) {
            grupos[status].push(os);
        } else {
            grupos.pendente.push(os);
        }
    });

    // Ordenar cada grupo por prioridade
    Object.keys(grupos).forEach(status => {
        grupos[status].sort((a, b) => {
            const prioridadeOrder = { 'urgente': 4, 'alta': 3, 'media': 2, 'baixa': 1 };
            return prioridadeOrder[b.prioridade] - prioridadeOrder[a.prioridade];
        });
    });

    // Configurações das abas
    const configuracoes = {
        pendente: {
            titulo: 'Pendentes',
            icone: 'fas fa-clock',
            cor: 'bg-amber-50 text-amber-700 border-amber-200'
        },
        andamento: {
            titulo: 'Em Andamento',
            icone: 'fas fa-cog',
            cor: 'bg-blue-50 text-blue-700 border-blue-200'
        },
        concluida: {
            titulo: 'Concluídas',
            icone: 'fas fa-check-circle',
            cor: 'bg-green-50 text-green-700 border-green-200'
        },
        cancelada: {
            titulo: 'Canceladas',
            icone: 'fas fa-times-circle',
            cor: 'bg-red-50 text-red-700 border-red-200'
        }
    };

    // Encontrar primeira aba com conteúdo ou manter a atual
    if (!grupos[abaAtualOS] || grupos[abaAtualOS].length === 0) {
        abaAtualOS = Object.keys(grupos).find(status => grupos[status].length > 0) || 'pendente';
    }

    container.innerHTML = `
        <!-- Container principal -->
        <div class="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <!-- Header elegante -->
            <div class="px-4 sm:px-6 py-4 sm:py-6" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6">
                    <div class="mb-4 sm:mb-0">
                        <h1 class="text-xl sm:text-2xl font-bold text-white">Minhas Ordens de Serviço</h1>
                        <p class="text-blue-100 text-sm mt-1">Gerencie suas tarefas de manutenção</p>
                    </div>
                    <div class="text-white text-center sm:text-right">
                        <div class="text-xl sm:text-2xl font-bold">${minhasOS.length}</div>
                        <div class="text-xs text-blue-100">Total de OS</div>
                    </div>
                </div>
                
                <!-- Abas modernas -->
                <div class="bg-black bg-opacity-20 rounded-xl p-1.5">
                    <div class="grid grid-cols-2 gap-1.5 sm:flex sm:flex-row sm:gap-2">
                        ${Object.keys(grupos).map(status => {
        const config = configuracoes[status];
        const count = grupos[status].length;
        const isActive = status === abaAtualOS;
        return `
                                <button 
                                    onclick="trocarAbaOS('${status}')" 
                                    id="aba-${status}"
                                    class="flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-2 px-1.5 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-300 ${isActive ? 'bg-white text-gray-900 shadow-lg' : 'text-white hover:bg-white hover:bg-opacity-10'}"
                                    style="min-width: 0; width: 100%;"
                                >
                                    <div class="flex items-center space-x-1 justify-center sm:justify-start" style="min-width: 0;">
                                        <i class="${config.icone} ${status === 'andamento' && isActive ? 'fa-spin' : ''} text-xs sm:text-sm"></i>
                                        <span class="text-xs sm:text-sm" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${config.titulo}</span>
                                    </div>
                                    <span class="px-1 sm:px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-gray-100 text-gray-700' : 'bg-white bg-opacity-20 text-white'}">${count}</span>
                                </button>
                            `;
    }).join('')}
                    </div>
                </div>
            </div>

            <!-- Conteúdo das abas -->
            <div class="min-h-96">
                ${Object.keys(grupos).map(status => {
        const config = configuracoes[status];
        const isActive = status === abaAtualOS;

        return `
                        <div id="conteudo-${status}" class="aba-conteudo p-4 sm:p-6 ${isActive ? 'block' : 'hidden'}">
                            ${grupos[status].length === 0 ? `
                                <div class="text-center py-12 sm:py-20">
                                    <div class="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 bg-gray-100">
                                        <i class="${config.icone} text-2xl sm:text-3xl text-gray-400"></i>
                                    </div>
                                    <h3 class="text-lg sm:text-xl font-semibold text-gray-600 mb-2 sm:mb-3">Nenhuma OS ${config.titulo.toLowerCase()}</h3>
                                    <p class="text-gray-500 text-sm sm:text-base px-4">Não há ordens de serviço nesta categoria no momento</p>
                                </div>
                            ` : `
                                <!-- Header da seção -->
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6">
                                    <div class="flex items-center space-x-3 mb-3 sm:mb-0">
                                        <div class="w-8 sm:w-10 h-8 sm:h-10 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                                            <i class="${config.icone} text-white text-sm sm:text-lg ${status === 'andamento' ? 'fa-spin' : ''}"></i>
                                        </div>
                                        <div>
                                            <h2 class="text-lg sm:text-xl font-bold text-gray-900">${config.titulo}</h2>
                                            <p class="text-gray-500 text-xs sm:text-sm">${grupos[status].length} ${grupos[status].length === 1 ? 'ordem' : 'ordens'} de serviço</p>
                                        </div>
                                    </div>
                                    <div class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${config.cor} font-bold text-sm sm:text-base self-start sm:self-auto">
                                        ${grupos[status].length}
                                    </div>
                                </div>

                                <!-- Grid de cards -->
                                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                                    ${grupos[status].map(os => {
            const acoes = getAcoesOS(os);
            return `
                                            <div class="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden hover:-translate-y-1">
                                                <!-- Header do card com gradiente por status -->
                                                <div class="p-4 sm:p-5 border-b border-gray-100 ${getCardHeaderGradient(os.status)}">
                                                    <div class="flex items-center justify-between mb-3 sm:mb-4">
                                                        <div class="flex items-center space-x-2 sm:space-x-3">
                                                            <div class="w-10 sm:w-12 h-10 sm:h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg ${getNumberGradient(os.status)} text-sm sm:text-base">
                                                                ${os.id}
                                                            </div>
                                                            <div>
                                                                <div class="font-bold text-white text-sm sm:text-base">OS #${os.id}</div>
                                                                <div class="text-xs text-white text-opacity-80">${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}</div>
                                                            </div>
                                                        </div>
                                                        <button onclick="verDetalhes(${os.id})" class="w-8 sm:w-10 h-8 sm:h-10 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-xl flex items-center justify-center text-white transition-all duration-200 hover:scale-110 backdrop-blur-sm">
                                                            <i class="fas fa-external-link-alt text-xs sm:text-sm"></i>
                                                        </button>
                                                    </div>
                                                    <div class="flex flex-wrap items-center gap-2">
                                                        <span class="px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-lg bg-white bg-opacity-90 text-gray-800 shadow-sm">${getStatusText(os.status)}</span>
                                                        <span class="px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-lg ${getPriorityGradient(os.prioridade)} text-white shadow-sm">${getPriorityIcon(os.prioridade)}</span>
                                                    </div>
                                                </div>

                                                <!-- Conteúdo do card -->
                                                <div class="p-4 sm:p-5">
                                                    <div class="space-y-3 sm:space-y-4 mb-4 sm:mb-5">
                                                        <div class="flex items-start space-x-2 sm:space-x-3">
                                                            <div class="w-6 sm:w-8 h-6 sm:h-8 rounded-lg flex items-center justify-center mt-0.5 ${getIconGradient('user')}">
                                                                <i class="fas fa-user text-white text-xs"></i>
                                                            </div>
                                                            <div class="flex-1 min-w-0">
                                                                <div class="text-xs text-gray-500 font-medium mb-1">SOLICITANTE</div>
                                                                <div class="font-semibold text-gray-900 text-sm sm:text-base truncate">${os.solicitante}</div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div class="flex items-start space-x-2 sm:space-x-3">
                                                            <div class="w-6 sm:w-8 h-6 sm:h-8 rounded-lg flex items-center justify-center mt-0.5 ${getIconGradient('building')}">
                                                                <i class="fas fa-building text-white text-xs"></i>
                                                            </div>
                                                            <div class="flex-1 min-w-0">
                                                                <div class="text-xs text-gray-500 font-medium mb-1">SETOR</div>
                                                                <div class="font-semibold text-gray-900 text-sm sm:text-base truncate">${os.setor}</div>
                                                            </div>
                                                        </div>

                                                        <div class="flex items-start space-x-2 sm:space-x-3">
                                                            <div class="w-6 sm:w-8 h-6 sm:h-8 rounded-lg flex items-center justify-center mt-0.5 ${getIconGradient('cogs')}">
                                                                <i class="fas fa-cogs text-white text-xs"></i>
                                                            </div>
                                                            <div class="flex-1 min-w-0">
                                                                <div class="text-xs text-gray-500 font-medium mb-1">EQUIPAMENTO</div>
                                                                <div class="font-semibold text-gray-900 text-sm sm:text-base truncate">${os.equipamento}</div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <!-- Descrição com gradiente sutil -->
                                                    <div class="rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 ${getDescriptionGradient(os.status)}">
                                                        <div class="text-xs font-medium mb-2 text-gray-600">DESCRIÇÃO</div>
                                                        <p class="text-xs sm:text-sm text-gray-700 leading-relaxed break-words">${os.descricao}</p>
                                                    </div>

                                                    <!-- Ações -->
                                                    ${acoes ? `<div class="flex flex-wrap gap-2">${acoes}</div>` : ''}
                                                </div>
                                            </div>
                                        `;
        }).join('')}
                                </div>
                            `}
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}



// Função para trocar abas (agora funcional)
function trocarAbaOS(novaAba) {
    abaAtualOS = novaAba;

    // Atualizar visual das abas
    document.querySelectorAll('[id^="aba-"]').forEach(aba => {
        const isActive = aba.id === `aba-${novaAba}`;

        if (isActive) {
            aba.className = 'flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 bg-white text-gray-900 shadow-lg transform scale-105';
            // Adicionar animação se for "andamento"
            const icon = aba.querySelector('i');
            if (novaAba === 'andamento') {
                icon.classList.add('fa-spin');
            }
        } else {
            aba.className = 'flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 text-white hover:bg-white hover:bg-opacity-10 hover:scale-102';
            // Remover animação
            const icon = aba.querySelector('i');
            icon.classList.remove('fa-spin');
        }

        // Atualizar contador
        const contador = aba.querySelector('span:last-child');
        if (contador) {
            contador.className = isActive ? 'px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700' : 'px-2 py-0.5 rounded-full text-xs font-bold bg-white bg-opacity-20 text-white';
        }
    });

    // Mostrar/esconder conteúdo
    document.querySelectorAll('.aba-conteudo').forEach(conteudo => {
        const isActive = conteudo.id === `conteudo-${novaAba}`;
        conteudo.className = `aba-conteudo p-6 ${isActive ? 'block' : 'hidden'}`;
    });
}



function carregarSelectMecanicoAdmin() {
    const select = document.getElementById('selectMecanicoAdmin');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um mecânico</option>';

    const mecanicos = usuarios.filter(u => u.tipo === 'mecanico');
    mecanicos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.usuario;
        opt.textContent = `${m.nome} (${m.usuario})`;
        select.appendChild(opt);
    });

    // Quando o admin escolher um mecânico, recarregar as OS dele
    select.onchange = () => {
        carregarMinhasOS(select.value);
    };
}

function carregarSelectMecanicoAdmin() {
    const select = document.getElementById('selectMecanicoAdmin');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um mecânico</option>';

    const mecanicos = usuarios.filter(u => u.tipo === 'mecanico');
    mecanicos.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.usuario;
        opt.textContent = `${m.nome} (${m.usuario})`;
        select.appendChild(opt);
    });

    // Quando o admin escolher um mecânico, recarregar as OS dele
    select.onchange = () => {
        carregarMinhasOS(select.value);
    };
}

function getAcoesOS(os) {
    let acoes = '';
    const podeEditar = usuarioLogado.tipo === 'admin' ||
        (usuarioLogado.tipo === 'mecanico' && tecnicos.find(t => t.usuario === usuarioLogado.usuario && t.id === os.tecnicoId));

    if (podeEditar) {
        if (os.status === 'pendente') {
            acoes += `<button onclick="iniciarOS(${os.id})" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-xs">
                        <i class="fas fa-play mr-1"></i>Iniciar
                    </button>`;
        }

        if (os.status === 'andamento') {
            acoes += `<button onclick="concluirOS(${os.id})" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-xs">
                        <i class="fas fa-check mr-1"></i>Concluir
                    </button>`;
        }

        if (os.status !== 'cancelada' && os.status !== 'concluida') {
            acoes += `<button onclick="cancelarOS(${os.id})" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs">
                        <i class="fas fa-ban mr-1"></i>Cancelar
                    </button>`;
        }
    }

    return acoes;
}

function iniciarOS(id) {
    const os = ordensServico.find(o => o.id === id);
    if (os) {
        os.status = 'andamento';
        os.dataInicio = new Date().toISOString();
        salvarDados();
        carregarListaOS();
        carregarMinhasOS();
        carregarTodasOSMecanicos();
        atualizarDashboard();
        mostrarToast('OS iniciada!');
    }
}

function carregarTodasOSMecanicos() {
    if (usuarioLogado.tipo !== 'admin') return;

    // Carregar filtro de mecânicos
    const filtroMecanico = document.getElementById('filtroMecanicoAdmin');
    if (filtroMecanico) {
        filtroMecanico.innerHTML = '<option value="">Todos os Mecânicos</option>';
        tecnicos.forEach(tecnico => {
            const option = document.createElement('option');
            option.value = tecnico.id;
            option.textContent = tecnico.nome;
            filtroMecanico.appendChild(option);
        });
    }

    // Aplicar filtros
    let osFiltradas = ordensServico.filter(os => os.tecnicoId); // Apenas OS com técnico atribuído

    const filtroMecanicoId = document.getElementById('filtroMecanicoAdmin')?.value;
    const filtroStatus = document.getElementById('filtroStatusAdmin')?.value;
    const filtroBusca = document.getElementById('filtroBuscaAdmin')?.value?.toLowerCase();

    if (filtroMecanicoId) {
        osFiltradas = osFiltradas.filter(os => os.tecnicoId === parseInt(filtroMecanicoId));
    }

    if (filtroStatus) {
        osFiltradas = osFiltradas.filter(os => os.status === filtroStatus);
    }

    if (filtroBusca) {
        osFiltradas = osFiltradas.filter(os =>
            os.solicitante.toLowerCase().includes(filtroBusca) ||
            os.equipamento.toLowerCase().includes(filtroBusca) ||
            os.setor.toLowerCase().includes(filtroBusca) ||
            os.id.toString().includes(filtroBusca)
        );
    }

    // Ordenar por prioridade e data
    osFiltradas.sort((a, b) => {
        const prioridadeOrder = { 'urgente': 4, 'alta': 3, 'media': 2, 'baixa': 1 };
        if (a.prioridade !== b.prioridade) {
            return prioridadeOrder[b.prioridade] - prioridadeOrder[a.prioridade];
        }
        return new Date(b.dataAbertura) - new Date(a.dataAbertura);
    });

    // Atualizar estatísticas por mecânico
    atualizarEstatisticasMecanicos();

    // Renderizar lista
    const container = document.getElementById('todasOSMecanicos');
    if (!container) return;

    container.innerHTML = '';

    if (osFiltradas.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Nenhuma OS encontrada</p>';
        return;
    }

    osFiltradas.forEach(os => {
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-lg p-4 card-hover border-l-4';

        // Cor da borda baseada no status
        const corBorda = {
            'pendente': 'border-red-500',
            'andamento': 'border-yellow-500',
            'concluida': 'border-green-500',
            'cancelada': 'border-gray-500'
        };
        div.classList.add(corBorda[os.status] || 'border-gray-300');

        div.innerHTML = `
            
<!-- Container dos cards -->
<div class="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

    <!-- Card individual -->
    <div class="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow duration-300">

        <!-- Header Section -->
        <div class="flex items-start justify-between mb-6 pb-4 border-b border-gray-100">
            <div class="flex items-center space-x-3">
                <span class="font-bold text-xl sm:text-2xl text-gray-800">#${os.id}</span>
                <span class="px-3 py-1.5 text-xs font-semibold rounded-full status-${os.status}">
                    ${getStatusText(os.status)}
                </span>
                <span class="px-3 py-1.5 text-xs font-semibold rounded-full priority-${os.prioridade}">
                    ${getPriorityIcon(os.prioridade)}
                </span>
            </div>
            <button onclick="verDetalhesCompletos(${os.id})"
                class="bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 p-3 rounded-lg transition-all duration-200 hover:scale-105">
                <i class="fas fa-eye text-lg"></i>
            </button>
        </div>

        <!-- Main Info Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            <!-- Solicitante -->
            <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
                    <i class="fas fa-user-circle mr-2 text-blue-500"></i>
                    Informações do Solicitante
                </h4>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Solicitante:</span>
                        <span class="text-gray-800">${os.solicitante}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Setor:</span>
                        <span class="text-gray-800">${os.setor}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Equipamento:</span>
                        <span class="text-gray-800">${os.equipamento}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Técnico:</span>
                        <span
                            class="text-gray-800 ${tecnico ? '' : 'italic text-gray-500'}">${tecnico ? tecnico.nome : 'Não atribuído'}</span>
                    </div>
                </div>
            </div>

            <!-- Cronologia -->
            <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
                    <i class="fas fa-calendar-alt mr-2 text-green-500"></i>
                    Cronologia
                </h4>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Abertura:</span>
                        <span class="text-gray-800">${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}</span>
                    </div>
                    ${os.dataInicio ? `
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Início:</span>
                        <span class="text-gray-800">${new Date(os.dataInicio).toLocaleDateString('pt-BR')}</span>
                    </div>
                    ` : ''}
                    ${os.dataConclusao ? `
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Conclusão:</span>
                        <span class="text-gray-800">${new Date(os.dataConclusao).toLocaleDateString('pt-BR')}</span>
                    </div>
                    ` : ''}
                    <div class="flex justify-between">
                        <span class="font-medium text-gray-600">Criado por:</span>
                        <span class="text-gray-800">${os.criadoPor}</span>
                    </div>
                </div>
            </div>

        </div>

        <!-- Service Report Section -->
        ${os.relatorioServico ? `
        <div
            class="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 p-5 rounded-lg mb-6 shadow-sm">
            <h5 class="font-bold text-green-800 mb-3 flex items-center text-lg">
                <i class="fas fa-clipboard-check mr-2"></i>
                Relatório do Serviço
            </h5>
            <p class="text-sm text-green-700 leading-relaxed mb-3">${os.relatorioServico}</p>

            ${os.materiaisUtilizados ? `
            <div class="bg-white bg-opacity-60 rounded-md p-3 mb-2">
                <div class="flex items-start">
                    <i class="fas fa-tools text-green-600 mr-2 mt-0.5"></i>
                    <div>
                        <span class="font-semibold text-green-800">Materiais Utilizados:</span>
                        <p class="text-sm text-green-700 mt-1">${os.materiaisUtilizados}</p>
                    </div>
                </div>
            </div>
            ` : ''}

            ${os.observacoesFinais ? `
            <div class="bg-white bg-opacity-60 rounded-md p-3">
                <div class="flex items-start">
                    <i class="fas fa-sticky-note text-green-600 mr-2 mt-0.5"></i>
                    <div>
                        <span class="font-semibold text-green-800">Observações Finais:</span>
                        <p class="text-sm text-green-700 mt-1">${os.observacoesFinais}</p>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
        ` : ''}

        <!-- Description Section -->
        <div
            class="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-5 rounded-lg shadow-sm">
            <h5 class="font-bold text-blue-800 mb-3 flex items-center text-lg">
                <i class="fas fa-file-alt mr-2"></i>
                Descrição do Problema
            </h5>
            <p class="text-sm text-blue-700 leading-relaxed">${os.descricao}</p>
        </div>

    </div>
</div>


                `;
        container.appendChild(div);
    });
}

function atualizarEstatisticasMecanicos() {
    const container = document.getElementById('estatisticasMecanicos');
    if (!container) return;

    container.innerHTML = '';

    tecnicos.forEach(tecnico => {
        const osDoTecnico = ordensServico.filter(os => os.tecnicoId === tecnico.id);
        const osConcluidas = osDoTecnico.filter(os => os.status === 'concluida').length;
        const osAndamento = osDoTecnico.filter(os => os.status === 'andamento').length;
        const osPendentes = osDoTecnico.filter(os => os.status === 'pendente').length;

        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded-lg border';
        div.innerHTML = `
    <div class="text-center p-1">
        <!-- Avatar e Info do Técnico -->
        <div class="flex flex-col items-center mb-4">
            <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg mb-3">
                🔧
            </div>
            <h4 class="font-bold text-gray-900 text-lg mb-1">${tecnico.nome}</h4>
            <div class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                ${tecnico.especialidade}
            </div>
        </div>

        <!-- Estatísticas -->
        <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-white">
                <div class="flex items-center justify-center mb-1">
                    <i class="fas fa-clipboard-list text-white mr-1"></i>
                </div>
                <div class="font-bold text-white text-lg">${osDoTecnico.length}</div>
                <div class="text-blue-100 font-medium">Total</div>
            </div>
            
            <div class="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-white">
                <div class="flex items-center justify-center mb-1">
                    <i class="fas fa-check-circle text-white mr-1"></i>
                </div>
                <div class="font-bold text-white text-lg">${osConcluidas}</div>
                <div class="text-green-100 font-medium">Concluídas</div>
            </div>
            
            <div class="bg-gradient-to-br from-yellow-500 to-yellow-600 p-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-white">
                <div class="flex items-center justify-center mb-1">
                    <i class="fas fa-clock text-white mr-1"></i>
                </div>
                <div class="font-bold text-white text-lg">${osAndamento}</div>
                <div class="text-yellow-100 font-medium">Andamento</div>
            </div>
            
            <div class="bg-gradient-to-br from-red-500 to-red-600 p-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-white">
                <div class="flex items-center justify-center mb-1">
                    <i class="fas fa-exclamation-circle text-white mr-1"></i>
                </div>
                <div class="font-bold  text-white text-lg">${osPendentes}</div>
                <div class="text-red-100 font-medium">Pendentes</div>
            </div>
        </div>

        <!-- Barra de Progresso -->
        <div class="mt-4 pt-3 border-t border-gray-200">
            <div class="text-xs text-gray-600 mb-2 font-medium">Taxa de Conclusão</div>
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-500" 
                     style="width: ${osDoTecnico.length > 0 ? (osConcluidas / osDoTecnico.length * 100) : 0}%"></div>
            </div>
            <div class="text-xs text-gray-500 mt-1 font-medium">
                ${osDoTecnico.length > 0 ? Math.round(osConcluidas / osDoTecnico.length * 100) : 0}%
            </div>
        </div>
    </div>
`;
        container.appendChild(div);
    });
}

function verDetalhesCompletos(id) {
    const os = ordensServico.find(o => o.id === id);
    const tecnico = tecnicos.find(t => t.id === os.tecnicoId);

    if (os) {
        const detalhes = document.getElementById('detalhesOS');
        detalhes.innerHTML = `
                    <div class="space-y-4">
                        <div class="text-center">
                            <h4 class="text-xl font-bold text-gray-800">OS #${os.id}</h4>
                            <div class="flex justify-center space-x-2 mt-2">
                                <span class="px-3 py-1 text-sm rounded-full status-${os.status}">${getStatusText(os.status)}</span>
                                <span class="px-3 py-1 text-sm rounded-full priority-${os.prioridade}">${getPriorityText(os.prioridade)}</span>
                            </div>
                        </div>
                        
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <h5 class="font-bold mb-2">Informações Gerais</h5>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div><strong>Solicitante:</strong> ${os.solicitante}</div>
                                    <div><strong>Setor:</strong> ${os.setor}</div>
                                    <div><strong>Equipamento:</strong> ${os.equipamento}</div>
                                    <div><strong>Localização:</strong> ${os.localizacao}</div>
                                </div>
                                <div>
                                    <div><strong>Técnico:</strong> ${tecnico ? tecnico.nome : 'Não atribuído'}</div>
                                    <div><strong>Tipo de Serviço:</strong> ${os.tipoServico}</div>
                                    <div><strong>Criado por:</strong> ${os.criadoPor}</div>
                                    ${os.tempoEstimado ? `<div><strong>Tempo Estimado:</strong> ${os.tempoEstimado}h</div>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="bg-blue-50 p-4 rounded-lg">
                            <h5 class="font-bold mb-2">Descrição do Problema</h5>
                            <p class="text-sm">${os.descricao}</p>
                            ${os.materiais ? `
                                <div class="mt-3">
                                    <strong>Materiais Necessários:</strong>
                                    <p class="text-sm mt-1">${os.materiais}</p>
                                </div>
                            ` : ''}
                            ${os.observacoes ? `
                                <div class="mt-3">
                                    <strong>Observações:</strong>
                                    <p class="text-sm mt-1">${os.observacoes}</p>
                                </div>
                            ` : ''}
                        </div>

                        ${os.relatorioServico ? `
                            <div class="bg-green-50 p-4 rounded-lg">
                                <h5 class="font-bold mb-2 text-green-800">Relatório do Serviço Executado</h5>
                                <p class="text-sm mb-3">${os.relatorioServico}</p>
                                ${os.materiaisUtilizados ? `
                                    <div class="mb-3">
                                        <strong>Materiais Utilizados:</strong>
                                        <p class="text-sm mt-1">${os.materiaisUtilizados}</p>
                                    </div>
                                ` : ''}
                                ${os.observacoesFinais ? `
                                    <div>
                                        <strong>Observações Finais:</strong>
                                        <p class="text-sm mt-1">${os.observacoesFinais}</p>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                        
                        <div class="bg-green-50 p-4 rounded-lg">
                            <h5 class="font-bold mb-2">Cronologia</h5>
                            <div class="space-y-1 text-sm">
                                <div><strong>Abertura:</strong> ${new Date(os.dataAbertura).toLocaleString('pt-BR')}</div>
                                <div><strong>Início:</strong> ${os.dataInicio ? new Date(os.dataInicio).toLocaleString('pt-BR') : 'Não iniciado'}</div>
                                <div><strong>Conclusão:</strong> ${os.dataConclusao ? new Date(os.dataConclusao).toLocaleString('pt-BR') : 'Não concluído'}</div>
                                ${os.dataInicio && os.dataConclusao ? `
                                    <div><strong>Tempo Total:</strong> ${calcularTempoExecucao(os.dataInicio, os.dataConclusao)}</div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
        document.getElementById('modalOS').classList.remove('hidden');
    }
}

function calcularTempoExecucao(dataInicio, dataConclusao) {
    const inicio = new Date(dataInicio);
    const conclusao = new Date(dataConclusao);
    const diffMs = conclusao - inicio;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}min`;
    } else {
        return `${diffMinutes}min`;
    }
}

function concluirOS(id) {
    const os = ordensServico.find(o => o.id === id);
    if (os) {
        // Preencher informações da OS no modal
        document.getElementById('osIdConclusao').value = id;
        document.getElementById('infoOSConclusao').innerHTML = `
                    <div><strong>OS #${os.id}</strong></div>
                    <div>Solicitante: ${os.solicitante}</div>
                    <div>Equipamento: ${os.equipamento}</div>
                    <div>Setor: ${os.setor}</div>
                `;

        // Limpar campos do formulário
        document.getElementById('relatorioServico').value = '';
        document.getElementById('materiaisUtilizados').value = '';
        document.getElementById('observacoesFinais').value = '';

        // Mostrar modal
        document.getElementById('modalConclusao').classList.remove('hidden');
    }
}

function fecharModalConclusao() {
    document.getElementById('modalConclusao').classList.add('hidden');
}

document.getElementById('conclusaoForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const osId = parseInt(document.getElementById('osIdConclusao').value);
    const relatorioServico = document.getElementById('relatorioServico').value;
    const materiaisUtilizados = document.getElementById('materiaisUtilizados').value;
    const observacoesFinais = document.getElementById('observacoesFinais').value;

    const os = ordensServico.find(o => o.id === osId);
    if (os) {
        os.status = 'concluida';
        os.dataConclusao = new Date().toISOString();
        os.relatorioServico = relatorioServico;
        os.materiaisUtilizados = materiaisUtilizados;
        os.observacoesFinais = observacoesFinais;

        salvarDados();

        fecharModalConclusao();
        carregarListaOS();
        carregarMinhasOS();
        carregarTodasOSMecanicos();
        atualizarDashboard();
        mostrarToast('OS concluída com sucesso!');
    }
});

async function cancelarOS(id) {
    if (!confirm('Cancelar esta OS?')) return;

    const os = ordensServico.find(o => o.id === id);
    if (!os) return;

    // marca como cancelada (pode adicionar metadata se quiser)
    os.status = 'cancelada';
    os.canceladoEm = new Date().toISOString(); // opcional

    // PERSISTIR: usar a função central de salvar (vai para Firebase quando online,
    // ou empilha na fila se offline — mantém comportamento já existente)
    await salvarDados();

    // atualizar UI
    carregarListaOS();
    carregarMinhasOS();
    atualizarDashboard();
    mostrarToast('OS cancelada!');
}

function verDetalhes(id) {
    const os = ordensServico.find(o => o.id === id);
    const tecnico = tecnicos.find(t => t.id === os.tecnicoId);

    if (os) {
        const detalhes = document.getElementById('detalhesOS');
        detalhes.innerHTML = `
    <div class="space-y-6 max-h-[80vh] overflow-y-auto">
        <!-- Header Elegante -->
        <div class="text-center relative overflow-hidden rounded-2xl p-6" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
            <div class="absolute inset-0 bg-black bg-opacity-10"></div>
            <div class="relative text-white">
                <h4 class="text-3xl font-bold mb-3">OS #${os.id}</h4>
                <div class="flex justify-center space-x-3">
                    <span class="px-4 py-2 text-white text-sm font-semibold rounded-full bg-white bg-opacity-20 backdrop-blur-sm border border-white border-opacity-30 status-${os.status}">
                        ${getStatusText(os.status)}
                    </span>
                    <span class="px-4 py-2 text-white text-sm font-semibold rounded-full bg-white bg-opacity-20 backdrop-blur-sm border border-white border-opacity-30 priority-${os.prioridade}">
                        ${getPriorityText(os.prioridade)}
                    </span>
                </div>
            </div>
        </div>
        
        <!-- Grid de Informações -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Informações Principais -->
            <div class="bg-gradient-to-br from-gray-50 to-white p-5 rounded-2xl shadow-lg border border-gray-100">
                <div class="flex items-center mb-4">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white mr-3" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                        <i class="fas fa-info-circle text-sm"></i>
                    </div>
                    <h5 class="font-bold text-lg text-gray-800">Informações</h5>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center p-2 bg-white rounded-lg shadow-sm">
                        <div class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-user text-white text-xs"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-xs text-gray-500 block">Solicitante</span>
                            <span class="font-semibold text-gray-800">${os.solicitante}</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center p-2 bg-white rounded-lg shadow-sm">
                        <div class="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-building text-white text-xs"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-xs text-gray-500 block">Setor</span>
                            <span class="font-semibold text-gray-800">${os.setor}</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center p-2 bg-white rounded-lg shadow-sm">
                        <div class="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-cogs text-white text-xs"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-xs text-gray-500 block">Equipamento</span>
                            <span class="font-semibold text-gray-800">${os.equipamento}</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center p-2 bg-white rounded-lg shadow-sm">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-white mr-3" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                            <i class="fas fa-wrench text-xs"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-xs text-gray-500 block">Técnico</span>
                            <span class="font-semibold text-gray-800">${tecnico ? tecnico.nome : 'Não atribuído'}</span>
                            ${!tecnico ? '<div class="text-xs text-amber-600 font-medium">⚠️ Aguardando atribuição</div>' : ''}
                        </div>
                    </div>
                    
                    ${os.criadoPor ? `
                    <div class="flex items-center p-2 bg-white rounded-lg shadow-sm">
                        <div class="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-user-plus text-white text-xs"></i>
                        </div>
                        <div class="flex-1">
                            <span class="text-xs text-gray-500 block">Criado por</span>
                            <span class="font-semibold text-gray-800">${os.criadoPor}</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Timeline de Datas -->
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-5 rounded-2xl shadow-lg border border-green-100">
                <div class="flex items-center mb-4">
                    <div class="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center text-white mr-3">
                        <i class="fas fa-clock text-sm"></i>
                    </div>
                    <h5 class="font-bold text-lg text-gray-800">Timeline</h5>
                </div>
                <div class="space-y-4">
                    <div class="flex items-center">
                        <div class="w-3 h-3 bg-blue-500 rounded-full mr-3 flex-shrink-0"></div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800 text-sm">Abertura</div>
                            <div class="text-xs text-gray-600">${new Date(os.dataAbertura).toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center">
                        <div class="w-3 h-3 ${os.dataInicio ? 'bg-yellow-500' : 'bg-gray-300'} rounded-full mr-3 flex-shrink-0"></div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800 text-sm">Início</div>
                            <div class="text-xs ${os.dataInicio ? 'text-gray-600' : 'text-gray-400'}">${os.dataInicio ? new Date(os.dataInicio).toLocaleString('pt-BR') : 'Não iniciado'}</div>
                        </div>
                    </div>
                    
                    <div class="flex items-center">
                        <div class="w-3 h-3 ${os.dataConclusao ? 'bg-green-500' : 'bg-gray-300'} rounded-full mr-3 flex-shrink-0"></div>
                        <div class="flex-1">
                            <div class="font-semibold text-gray-800 text-sm">Conclusão</div>
                            <div class="text-xs ${os.dataConclusao ? 'text-gray-600' : 'text-gray-400'}">${os.dataConclusao ? new Date(os.dataConclusao).toLocaleString('pt-BR') : 'Não concluído'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Descrição Expandida -->
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl shadow-lg border border-blue-100">
            <div class="flex items-center mb-4">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-white mr-3" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                    <i class="fas fa-file-alt text-sm"></i>
                </div>
                <h5 class="font-bold text-lg text-gray-800">Descrição do Problema</h5>
            </div>
            <div class="bg-white bg-opacity-60 p-4 rounded-xl border border-blue-200">
                <p class="text-gray-700 leading-relaxed">${os.descricao}</p>
            </div>
        </div>
        
        <!-- Status Atual -->
        <div class="bg-gradient-to-br from-yellow-50 to-orange-50 p-5 rounded-2xl shadow-lg border border-yellow-100">
            <div class="flex items-center mb-4">
                <div class="w-8 h-8 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center text-white mr-3">
                    <i class="fas fa-info text-sm"></i>
                </div>
                <h5 class="font-bold text-lg text-gray-800">Status Atual</h5>
            </div>
            <div class="bg-white bg-opacity-60 p-4 rounded-xl border border-yellow-200">
                <div class="flex items-center space-x-2 mb-2">
                    <div class="w-3 h-3 rounded-full status-indicator-${os.status}"></div>
                    <span class="font-semibold text-gray-800">${getStatusText(os.status)}</span>
                </div>
                <p class="text-sm text-gray-600">
                    ${os.status === 'aberto' ? 'Aguardando início do atendimento' :
                os.status === 'andamento' ? 'Técnico trabalhando na solução' :
                    os.status === 'concluido' ? 'Serviço finalizado com sucesso' :
                        'Aguardando...'}
                </p>
            </div>
        </div>
    
        </div>
        
     
    </div>

    <style>
        /* Estilos para status */
        .status-aberto { @apply text-yellow-100; }
        .status-andamento { @apply text-blue-100; }
        .status-concluido { @apply text-green-100; }
        .status-cancelado { @apply text-red-100; }
        
        /* Indicadores de status */
        .status-indicator-aberto { @apply bg-yellow-400; }
        .status-indicator-andamento { @apply bg-blue-400; }
        .status-indicator-concluido { @apply bg-green-400; }
        .status-indicator-cancelado { @apply bg-red-400; }
        
        /* Estilo para kbd */
        kbd {
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
    </style>
`;
        document.getElementById('modalOS').classList.remove('hidden');
    }
}

function fecharModal() {
    document.getElementById('modalOS').classList.add('hidden');
}

function filtrarOS() {
    carregarListaOS();
}

function exportarDados() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    const dados = {
        ordensServico: ordensServico,
        tecnicos: tecnicos,
        usuarios: usuarios,
        proximoId: proximoId,
        dataExport: new Date().toISOString()
    };

    const dataStr = JSON.stringify(dados, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `backup-os-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    mostrarToast('Dados exportados!');
}

async function importarDados() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Selecione um arquivo para importar.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const dados = JSON.parse(e.target.result);

            if (confirm('Importar dados? As OS e notas atuais serão substituídas.')) {
                // 🔹 Importa apenas dados de OS e notas
                ordensServico = dados.ordensServico || [];
                notas = dados.notas || [];

                // 🔹 Mantém técnicos atuais, mas se o backup tiver técnicos, mescla
                if (dados.tecnicos && dados.tecnicos.length > 0) {
                    tecnicos = [...tecnicos, ...dados.tecnicos.filter(t => !tecnicos.some(x => x.id === t.id))];
                }

                // 🔹 Não sobrescreve usuários! (mantém cadastros atuais)
                proximoId = dados.proximoId || proximoId;

                // 🔹 Salva na nuvem (Firebase)
                await salvarDados();

                carregarTecnicos();
                atualizarDashboard();
                carregarListaOS();
                carregarConfiguracoes();

                mostrarToast(`Backup ${dados.periodo || ""} importado e salvo na nuvem!`, "success");
            }
        } catch (error) {
            console.error("Erro ao importar:", error);
            alert('Erro ao importar arquivo.');
        }
    };
    reader.readAsText(file);
}


async function limparTodos() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    if (confirm('Limpar todos os dados? Esta ação não pode ser desfeita.')) {
        try {
            const FIREBASE_URL = 'https://teste-b4489-default-rtdb.firebaseio.com/'; // <-- troque pelo seu URL

            // Apaga todos os dados da raiz do banco
            const response = await fetch(`${FIREBASE_URL}/.json`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Erro ao limpar dados no Firebase');
            }

            // Limpa o localStorage
            localStorage.clear();
            ordensServico = [];
            tecnicos = [];
            usuarios = [
                { id: 1, usuario: 'admin', senha: 'admin123', nome: 'Administrador', tipo: 'admin' }
            ];
            proximoId = 1;

            // Recria usuários e técnicos básicos no localStorage e no Firebase
            await fetch(`${FIREBASE_URL}/usuarios.json`, {
                method: 'PUT',
                body: JSON.stringify(usuarios),
                headers: { 'Content-Type': 'application/json' }
            });

            await fetch(`${FIREBASE_URL}/tecnicos.json`, {
                method: 'PUT',
                body: JSON.stringify(tecnicos),
                headers: { 'Content-Type': 'application/json' }
            });

            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            localStorage.setItem('tecnicos', JSON.stringify(tecnicos));

            // Atualiza telas
            carregarTecnicos();
            atualizarDashboard();
            carregarListaOS();
            carregarConfiguracoes();

            mostrarToast('Todos os dados foram apagados com sucesso!');
        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao apagar os dados no Firebase', 'error');
        }
    }
}

function mostrarToast(mensagem, tipo = 'success') {
    const toast = document.getElementById('toast');
    const toastDiv = toast.querySelector('div');

    // Cores baseadas no tipo
    if (tipo === 'error') {
        toastDiv.className = 'bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg';
    } else {
        toastDiv.className = 'bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg';
    }

    document.getElementById('toastMessage').textContent = mensagem;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function getStatusText(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'andamento': 'Em Andamento',
        'concluida': 'Concluída',
        'cancelada': 'Cancelada'
    };
    return statusMap[status] || status;
}

function getPriorityIcon(priority) {
    const iconMap = {
        'baixa': '🟢',
        'media': '🟡',
        'alta': '🟠',
        'urgente': '🔴'
    };
    return iconMap[priority] || '';
}

function getPriorityText(priority) {
    const textMap = {
        'baixa': 'Baixa',
        'media': 'Média',
        'alta': 'Alta',
        'urgente': 'Urgente'
    };
    return textMap[priority] || priority;
}

function atualizarGraficos() {
    if (usuarioLogado && usuarioLogado.tipo === 'admin') {
        criarGraficoStatus();
        criarGraficoPrioridade();
        criarGraficoTecnicos();
    }
}

function criarGraficoStatus() {
    const ctx = document.getElementById('graficoStatus');
    if (!ctx) return;

    const periodo = parseInt(document.getElementById('periodoGrafico')?.value || 30);
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - periodo);

    const osFiltradas = ordensServico.filter(os =>
        new Date(os.dataAbertura) >= dataLimite
    );

    const dados = {
        pendente: osFiltradas.filter(os => os.status === 'pendente').length,
        andamento: osFiltradas.filter(os => os.status === 'andamento').length,
        concluida: osFiltradas.filter(os => os.status === 'concluida').length,
        cancelada: osFiltradas.filter(os => os.status === 'cancelada').length
    };

    if (graficoStatusChart) {
        graficoStatusChart.destroy();
    }
    graficoStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendente', 'Em Andamento', 'Concluída', 'Cancelada'],
            datasets: [{
                data: [dados.pendente, dados.andamento, dados.concluida, dados.cancelada],
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#6b7280'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            plugins: {
                legend: {
                    labels: {
                        color: 'white',
                        font: {
                            size: 14
                        }
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function criarGraficoPrioridade() {
    const ctx = document.getElementById('graficoPrioridade');
    if (!ctx) return;

    const dados = {
        baixa: ordensServico.filter(os => os.prioridade === 'baixa').length,
        media: ordensServico.filter(os => os.prioridade === 'media').length,
        alta: ordensServico.filter(os => os.prioridade === 'alta').length,
        urgente: ordensServico.filter(os => os.prioridade === 'urgente').length
    };

    if (graficoPrioridadeChart) {
        graficoPrioridadeChart.destroy();
    }

    graficoPrioridadeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Baixa', 'Média', 'Alta', 'Urgente'],
            datasets: [{
                label: 'Quantidade de OS',
                data: [dados.baixa, dados.media, dados.alta, dados.urgente],
                backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: 'white',
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: 'white',
                        font: {
                            size: 12
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

function abrirModalRelatorios() {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    // Carregar técnicos no select
    const selectTecnico = document.getElementById('relatorioTecnico');
    selectTecnico.innerHTML = '<option value="">Todos os Técnicos</option>';
    tecnicos.forEach(tecnico => {
        const option = document.createElement('option');
        option.value = tecnico.id;
        option.textContent = tecnico.nome;
        selectTecnico.appendChild(option);
    });

    // Carregar OS no select individual
    const selectOS = document.getElementById('osIndividual');
    selectOS.innerHTML = '<option value="">Selecione uma OS</option>';
    ordensServico.forEach(os => {
        const option = document.createElement('option');
        option.value = os.id;
        option.textContent = `#${os.id} - ${os.solicitante} - ${os.equipamento}`;
        selectOS.appendChild(option);
    });

    document.getElementById('modalRelatorios').classList.remove('hidden');
}

function fecharModalRelatorios() {
    document.getElementById('modalRelatorios').classList.add('hidden');
}

document.getElementById('relatorioPeriodo')?.addEventListener('change', function () {
    const isCustom = this.value === 'custom';
    document.getElementById('dataInicioDiv').classList.toggle('hidden', !isCustom);
    document.getElementById('dataFimDiv').classList.toggle('hidden', !isCustom);
});

function filtrarOSPorPeriodo() {
    const periodo = document.getElementById('relatorioPeriodo').value;
    let dataInicio, dataFim;

    if (periodo === 'custom') {
        dataInicio = new Date(document.getElementById('relatorioDataInicio').value);
        dataFim = new Date(document.getElementById('relatorioDataFim').value);
    } else {
        dataFim = new Date();
        dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - parseInt(periodo));
    }

    return ordensServico.filter(os => {
        const dataOS = new Date(os.dataAbertura);
        return dataOS >= dataInicio && dataOS <= dataFim;
    });
}

function aplicarFiltrosRelatorio(osLista = null) {
    let osFiltradas = osLista || filtrarOSPorPeriodo();

    const status = document.getElementById('relatorioStatus').value;
    const prioridade = document.getElementById('relatorioPrioridade').value;
    const tecnicoId = document.getElementById('relatorioTecnico').value;

    if (status) {
        osFiltradas = osFiltradas.filter(os => os.status === status);
    }

    if (prioridade) {
        osFiltradas = osFiltradas.filter(os => os.prioridade === prioridade);
    }

    if (tecnicoId) {
        osFiltradas = osFiltradas.filter(os => os.tecnicoId === parseInt(tecnicoId));
    }

    return osFiltradas;
}

function calcularEstatisticas(osList) {
    const total = osList.length;
    const concluidas = osList.filter(o => o.status === 'concluida').length;
    const pendentes = osList.filter(o => o.status === 'pendente').length;
    const andamento = osList.filter(o => o.status === 'andamento').length;

    return {
        total,
        concluidas,
        andamento,
        pendentes,
        percConcluidas: total ? Math.round((concluidas / total) * 100) : 0,
        percAndamento: total ? Math.round((andamento / total) * 100) : 0,
        percPendentes: total ? Math.round((pendentes / total) * 100) : 0
    };
}

function gerarRelatorioIndividual(formato) {
    const osId = document.getElementById('osIndividual').value;
    if (!osId) {
        mostrarToast('Selecione uma OS!', 'error');
        return;
    }

    const os = ordensServico.find(o => o.id === parseInt(osId));
    const tecnico = tecnicos.find(t => t.id === os.tecnicoId);

    if (formato === 'pdf') {
        gerarPDFIndividual(os, tecnico);
    } else if (formato === 'word') {
        gerarWordIndividual(os, tecnico);
    }
}

function gerarRelatorioGeral(formato) {
    const osFiltradas = aplicarFiltrosRelatorio();

    if (formato === 'pdf') {
        gerarPDFGeral(osFiltradas);
    } else if (formato === 'word') {
        gerarWordGeral(osFiltradas);
    } else if (formato === 'excel') {
        gerarExcelGeral(osFiltradas);
    }
}

function gerarRelatorioTecnicos(formato) {
    const osFiltradas = aplicarFiltrosRelatorio();

    if (formato === 'pdf') {
        gerarPDFTecnicos(osFiltradas);
    } else if (formato === 'word') {
        gerarWordTecnicos(osFiltradas);
    } else if (formato === 'excel') {
        gerarExcelTecnicos(osFiltradas);
    }
}

function gerarRelatorioSetor(formato) {
    const osFiltradas = aplicarFiltrosRelatorio();

    if (formato === 'pdf') {
        gerarPDFSetor(osFiltradas);
    } else if (formato === 'word') {
        gerarWordSetor(osFiltradas);
    } else if (formato === 'excel') {
        gerarExcelSetor(osFiltradas);
    }
}

function gerarRelatorioEquipamentos(formato) {
    const osFiltradas = aplicarFiltrosRelatorio();

    if (formato === 'pdf') {
        gerarPDFEquipamentos(osFiltradas);
    } else if (formato === 'word') {
        gerarWordEquipamentos(osFiltradas);
    } else if (formato === 'excel') {
        gerarExcelEquipamentos(osFiltradas);
    }
}

function gerarRelatorioPersonalizado(formato) {
    const osFiltradas = aplicarFiltrosRelatorio();

    if (formato === 'pdf') {
        gerarPDFPersonalizado(osFiltradas);
    } else if (formato === 'word') {
        gerarWordPersonalizado(osFiltradas);
    } else if (formato === 'excel') {
        gerarExcelPersonalizado(osFiltradas);
    }
}

function gerarPDFIndividual(os, tecnico) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFontSize(20);
    doc.text('ORDEM DE SERVIÇO', 105, 20, { align: 'center' });

    doc.setFontSize(16);
    doc.text(`#${os.id}`, 105, 30, { align: 'center' });

    // Informações da OS
    let y = 50;
    doc.setFontSize(12);

    doc.text(`Solicitante: ${os.solicitante}`, 20, y);
    y += 10;
    doc.text(`Setor: ${os.setor}`, 20, y);
    y += 10;
    doc.text(`Equipamento: ${os.equipamento}`, 20, y);
    y += 10;
    doc.text(`Técnico: ${tecnico ? tecnico.nome : 'Não atribuído'}`, 20, y);
    y += 10;
    doc.text(`Status: ${getStatusText(os.status)}`, 20, y);
    y += 10;
    doc.text(`Prioridade: ${getPriorityText(os.prioridade)}`, 20, y);
    y += 10;
    doc.text(`Data de Abertura: ${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}`, 20, y);

    if (os.descricao) {
        y += 20;
        doc.text('Descrição:', 20, y);
        y += 10;
        const descricaoLines = doc.splitTextToSize(os.descricao, 170);
        doc.text(descricaoLines, 20, y);
    }

    doc.save(`OS_${os.id}_${os.solicitante}.pdf`);
    mostrarToast('PDF gerado com sucesso!');
}

function gerarPDFGeral(osFiltradas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho estilizado
    doc.setFillColor(30, 58, 138); // azul escuro
    doc.rect(0, 0, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("RELATÓRIO GERAL DE ORDENS DE SERVIÇO", 105, 12, { align: "center" });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}`, 14, 28);

    // Estatísticas
    let y = 40;
    const stats = calcularEstatisticas(osFiltradas);
    doc.setFontSize(12);
    doc.text("ESTATÍSTICAS:", 14, y);
    y += 8;
    doc.text(`Total: ${stats.total}`, 14, y);
    y += 6;
    doc.text(`Concluídas: ${stats.concluidas} (${stats.percConcluidas}%)`, 14, y);
    y += 6;
    doc.text(`Em Andamento: ${stats.andamento} (${stats.percAndamento}%)`, 14, y);
    y += 6;
    doc.text(`Pendentes: ${stats.pendentes} (${stats.percPendentes}%)`, 14, y);

    // Tabela de OS
    y += 14;
    doc.setFontSize(11);
    doc.text("LISTA DE ORDENS DE SERVIÇO", 14, y);

    y += 8;
    osFiltradas.forEach((os, i) => {
        if (y > 280) { doc.addPage(); y = 20; }
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        doc.text(
            `${os.id} - ${os.solicitante} - ${os.equipamento} - ${tecnico ? tecnico.nome : "N/A"} - ${getStatusText(os.status)}`,
            14,
            y
        );
        y += 6;
    });

    // Rodapé
    doc.setFontSize(9);
    doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, 200, 290, { align: "right" });

    doc.save(`Relatorio_Geral_${new Date().toISOString().split("T")[0]}.pdf`);
    mostrarToast("Relatório PDF gerado com sucesso!");
}


function gerarExcelGeral(osFiltradas) {
    const dados = osFiltradas.map(os => {
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        return {
            'ID': os.id,
            'Solicitante': os.solicitante,
            'Setor': os.setor,
            'Equipamento': os.equipamento,
            'Técnico': tecnico ? tecnico.nome : 'Não atribuído',
            'Status': getStatusText(os.status),
            'Prioridade': getPriorityText(os.prioridade),
            'Data Abertura': new Date(os.dataAbertura).toLocaleDateString('pt-BR'),
            'Descrição': os.descricao
        };
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ordens de Serviço');

    XLSX.writeFile(wb, `Relatorio_OS_${new Date().toISOString().split('T')[0]}.xlsx`);
    mostrarToast('Relatório Excel gerado com sucesso!');
}

function gerarWordGeral(osFiltradas) {
    let conteudo = `
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Relatório Geral de OS</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        h1 { text-align: center; color: #333; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    <h1>RELATÓRIO GERAL DE ORDENS DE SERVIÇO</h1>
                    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
                    
                    <h2>Estatísticas</h2>
                    <p>Total de OS: ${osFiltradas.length}</p>
                    <p>Concluídas: ${osFiltradas.filter(os => os.status === 'concluida').length}</p>
                    <p>Em Andamento: ${osFiltradas.filter(os => os.status === 'andamento').length}</p>
                    <p>Pendentes: ${osFiltradas.filter(os => os.status === 'pendente').length}</p>
                    
                    <h2>Lista de Ordens de Serviço</h2>
                    <table>
                        <tr>
                            <th>ID</th>
                            <th>Solicitante</th>
                            <th>Setor</th>
                            <th>Equipamento</th>
                            <th>Técnico</th>
                            <th>Status</th>
                            <th>Prioridade</th>
                            <th>Data</th>
                        </tr>
            `;

    osFiltradas.forEach(os => {
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        conteudo += `
                    <tr>
                        <td>${os.id}</td>
                        <td>${os.solicitante}</td>
                        <td>${os.setor}</td>
                        <td>${os.equipamento}</td>
                        <td>${tecnico ? tecnico.nome : 'N/A'}</td>
                        <td>${getStatusText(os.status)}</td>
                        <td>${getPriorityText(os.prioridade)}</td>
                        <td>${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}</td>
                    </tr>
                `;
    });

    conteudo += `
                    </table>
                </body>
                </html>
            `;

    const blob = new Blob([conteudo], { type: 'application/msword' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_OS_${new Date().toISOString().split('T')[0]}.doc`;
    link.click();

    mostrarToast('Relatório Word gerado com sucesso!');
}

function gerarPDFTecnicos(osFiltradas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("RELATÓRIO POR TÉCNICO", 105, 20, { align: "center" });

    const agrupado = osFiltradas.reduce((acc, os) => {
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId)?.nome || "Sem técnico";
        if (!acc[tecnico]) acc[tecnico] = [];
        acc[tecnico].push(os);
        return acc;
    }, {});

    let y = 40;
    for (const tecnico in agrupado) {
        doc.setFontSize(12);
        doc.text(`Técnico: ${tecnico}`, 14, y);
        y += 8;

        agrupado[tecnico].forEach(os => {
            if (y > 280) { doc.addPage(); y = 20; }
            doc.setFontSize(10);
            doc.text(`#${os.id} - ${os.equipamento} (${getStatusText(os.status)})`, 20, y);
            y += 6;
        });

        y += 8;
    }

    doc.save(`Relatorio_Tecnicos_${new Date().toISOString().split("T")[0]}.pdf`);
    mostrarToast("Relatório por técnicos gerado com sucesso!");
}
function gerarPDFSetor(osFiltradas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("RELATÓRIO POR SETOR", 105, 20, { align: "center" });

    // Agrupa por setor
    const agrupado = osFiltradas.reduce((acc, os) => {
        const setor = os.setor || "Sem setor";
        if (!acc[setor]) acc[setor] = [];
        acc[setor].push(os);
        return acc;
    }, {});

    let y = 40;
    for (const setor in agrupado) {
        doc.setFontSize(12);
        doc.text(`Setor: ${setor}`, 14, y);
        y += 8;

        agrupado[setor].forEach(os => {
            if (y > 280) { doc.addPage(); y = 20; }
            const tecnico = tecnicos.find(t => t.id === os.tecnicoId)?.nome || "N/A";
            doc.setFontSize(10);
            doc.text(`#${os.id} - ${os.equipamento} - ${tecnico} (${getStatusText(os.status)})`, 20, y);
            y += 6;
        });

        y += 8;
    }

    doc.save(`Relatorio_Setor_${new Date().toISOString().split("T")[0]}.pdf`);
    mostrarToast("Relatório por setor gerado com sucesso!");
}

function gerarPDFEquipamentos(osFiltradas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("RELATÓRIO POR EQUIPAMENTO", 105, 20, { align: "center" });

    // Agrupa por equipamento
    const agrupado = osFiltradas.reduce((acc, os) => {
        const equipamento = os.equipamento || "Sem equipamento";
        if (!acc[equipamento]) acc[equipamento] = [];
        acc[equipamento].push(os);
        return acc;
    }, {});

    let y = 40;
    for (const equipamento in agrupado) {
        doc.setFontSize(12);
        doc.text(`Equipamento: ${equipamento}`, 14, y);
        y += 8;

        agrupado[equipamento].forEach(os => {
            if (y > 280) { doc.addPage(); y = 20; }
            const tecnico = tecnicos.find(t => t.id === os.tecnicoId)?.nome || "N/A";
            doc.setFontSize(10);
            doc.text(`#${os.id} - ${os.solicitante} - ${os.setor} - ${tecnico} (${getStatusText(os.status)})`, 20, y);
            y += 6;
        });

        y += 8;
    }

    doc.save(`Relatorio_Equipamentos_${new Date().toISOString().split("T")[0]}.pdf`);
    mostrarToast("Relatório por equipamentos gerado com sucesso!");
}

function gerarPDFPersonalizado(osFiltradas) {
    // Usa o mesmo layout do geral, mas com filtros aplicados
    gerarPDFGeral(osFiltradas);
}


function gerarWordPersonalizado(osFiltradas) { gerarWordGeral(osFiltradas); }


function gerarExcelPersonalizado(osFiltradas) { gerarExcelGeral(osFiltradas); }

function filtrarDashboard(tipo) {
    document.getElementById('filtroStatus').value = tipo === 'total' ? '' : tipo;
    showTab('lista');
    filtrarOS();
}

function gerarRelatorio(tipo) {
    if (usuarioLogado.tipo !== 'admin') {
        mostrarToast('Acesso negado!', 'error');
        return;
    }

    if (tipo === 'geral') {
        gerarPDFGeral(ordensServico);
    } else if (tipo === 'mensal') {
        const dataInicio = new Date();
        dataInicio.setMonth(dataInicio.getMonth() - 1);
        const osUltimoMes = ordensServico.filter(os =>
            new Date(os.dataAbertura) >= dataInicio
        );
        gerarPDFGeral(osUltimoMes);
    } else if (tipo === 'tecnicos') {
        gerarPDFTecnicos(ordensServico);
    }
}
function criarGraficoTecnicos() {
    const ctx = document.getElementById('graficoTecnicos');
    if (!ctx) return;

    const dadosTecnicos = {};
    tecnicos.forEach(tecnico => {
        const osDoTecnico = ordensServico.filter(os => os.tecnicoId === tecnico.id);
        dadosTecnicos[tecnico.nome] = osDoTecnico.length;
    });

    const labels = Object.keys(dadosTecnicos);
    const dados = Object.values(dadosTecnicos);

    // Gerar cores diferentes para cada técnico
    const cores = labels.map((_, i) => {
        const tons = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#3b82f6', '#6366f1', '#ec4899'];
        return tons[i % tons.length];
    });

    if (graficoTecnicosChart) {
        graficoTecnicosChart.destroy();
    }

    graficoTecnicosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'OS Atribuídas',
                data: dados,
                backgroundColor: cores,
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y', // gráfico horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: 'white',
                        font: { size: 12 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: 'white',
                        font: { size: 12 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}
function exportarPDF() {
    const osParaExportar = ordensServico.filter(os => {
        const filtroStatus = document.getElementById('filtroStatus').value;
        const filtroPrioridade = document.getElementById('filtroPrioridade').value;
        const filtroBusca = document.getElementById('filtroBusca').value.toLowerCase();

        if (filtroStatus && os.status !== filtroStatus) return false;
        if (filtroPrioridade && os.prioridade !== filtroPrioridade) return false;
        if (filtroBusca) {
            const busca = `${os.id} ${os.solicitante} ${os.setor} ${os.equipamento} ${os.descricao}`.toLowerCase();
            if (!busca.includes(filtroBusca)) return false;
        }
        return true;
    });

    if (osParaExportar.length === 0) {
        alert('Nenhuma OS encontrada para exportar!');
        return;
    }

    const printWindow = window.open('', '_blank');

    const htmlContent = `
    <!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Ordens de Serviço</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.5;
            color: #1f2937;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        }

        /* Nova abordagem para PDF - sem page-break-after */
        @page {
            size: A4;
            margin: 0;
        }

        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            
            body {
                background: white !important;
                margin: 0;
                padding: 0;
            }
            
            .page {
                break-after: page;
                break-inside: avoid;
                height: 297mm;
                overflow: hidden;
                contain: layout style;
            }
            
            .page:last-child {
                break-after: auto;
            }
        }

        .container {
            width: 100%;
            max-width: none;
        }

        .page {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto 20px;
            padding: 25mm;
            background: white;
            position: relative;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            contain: layout style;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
            margin: -25mm -25mm 30px -25mm;
            padding: 25mm 25mm 20px 25mm;
            color: white;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 100px;
            height: 100px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            transform: translate(30px, -30px);
        }

        .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            z-index: 2;
        }

        .logo-placeholder {
            width: 100px;
            height: 100px;
            border-radius: 12px;
            overflow: hidden;
            border: 3px solid rgba(255, 255, 255, 0.3);
            background: rgba(255, 255, 255, 0.1);
        }

        .logo-placeholder img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .company-info {
            flex: 1;
            text-align: center;
            margin: 0 20px;
        }

        .company-name {
            font-size: 28px;
            font-weight: 800;
            color: white;
            margin-bottom: 5px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .company-subtitle {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .header-date {
            text-align: right;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.8);
        }

        /* OS ID */
        .os-id {
            font-size: 32px;
            font-weight: 800;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 25px;
            text-align: center;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        /* Badges */
        .badges {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
            justify-content: center;
        }

        .badge {
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s ease;
        }

        .badge:hover {
            transform: translateY(-2px);
        }

        .icon {
            font-size: 16px;
        }

        /* Status Colors */
        .status-pendente { background: #fef3c7; color: #92400e; }
        .status-andamento { background: #dbeafe; color: #1e40af; }
        .status-concluida { background: #d1fae5; color: #065f46; }
        .status-cancelada { background: #fee2e2; color: #991b1b; }

        /* Priority Colors */
        .priority-baixa { background: #f3f4f6; color: #374151; }
        .priority-media { background: #fef3c7; color: #92400e; }
        .priority-alta { background: #fecaca; color: #991b1b; }
        .priority-critica { background: #dc2626; color: white; }

        /* Info Grid */
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }

        .info-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .info-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
        }

        .info-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }

        .info-title {
            font-size: 12px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .info-value {
            font-size: 15px;
            font-weight: 600;
            color: #1f2937;
            word-wrap: break-word;
            line-height: 1.4;
        }

        /* Description */
        .description-section {
            margin-bottom: 30px;
        }

        .description-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            position: relative;
            overflow: hidden;
        }

        .description-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
        }

        .description-title {
            font-size: 16px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .description-text {
            font-size: 14px;
            line-height: 1.7;
            color: #4b5563;
            white-space: pre-wrap;
            background: rgba(248, 250, 252, 0.5);
            padding: 15px;
            border-radius: 8px;
            border-left: 3px solid #3b82f6;
        }

        /* Footer */
        .footer {
            margin-top: auto;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            margin-left: -25mm;
            margin-right: -25mm;
            margin-bottom: -25mm;
            padding-left: 25mm;
            padding-right: 25mm;
            padding-bottom: 20px;
        }

        .footer-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
        }

        .footer-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .footer-right {
            font-weight: 600;
            color: #3b82f6;
        }

        /* Responsivo */
        @media screen and (max-width: 768px) {
            .page {
                width: 100%;
                height: auto;
                padding: 20px;
                margin: 0 0 20px 0;
            }
            
            .header {
                margin: -20px -20px 30px -20px;
                padding: 20px 20px 20px 20px;
            }
            
            .header-content {
                flex-direction: column;
                text-align: center;
                gap: 15px;
            }
            
            .company-info {
                margin: 0;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
                gap: 15px;
            }
            
            .badges {
                flex-direction: column;
                align-items: center;
                gap: 10px;
            }
            
            .footer {
                margin-left: -20px;
                margin-right: -20px;
                margin-bottom: -20px;
                padding-left: 20px;
                padding-right: 20px;
            }
            
            .footer-content {
                flex-direction: column;
                gap: 5px;
                text-align: center;
            }
        }
    </style>
</head>
<body>
<img src="" alt="">
    <div class="container">
        ${osParaExportar.map((os, index) => {
        const tecnico = tecnicos.find(t => t.id === os.tecnicoId);
        const currentDate = new Date().toLocaleDateString('pt-BR');
        return `
                <div class="page">
                    <div class="header">
                        <div class="header-content">
                            <div class="logo-placeholder">
                                <img src="teste.jpg" alt="Logo" onerror="this.src='';>
                            </div>
                            <div class="company-info">
                                <div class="company-name">Embalagens Tatuí</div>
                                <div class="company-subtitle">Ordem de Serviço</div>
                            </div>
                            <div class="header-date">
                                <div>📅 ${currentDate}</div>
                                <div>🕐 ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    </div>

                    <div class="os-id">OS #${os.id}</div>

                    <div class="badges">
                        <div class="badge status-${os.status}">
                            <span class="icon">⚡</span> 
                            ${getStatusText(os.status)}
                        </div>
                        <div class="badge priority-${os.prioridade}">
                            <span class="icon">🔰</span> 
                            ${getPriorityText(os.prioridade)}
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-card">
                            <div class="info-title">👤 Solicitante</div>
                            <div class="info-value">${os.solicitante || 'Não informado'}</div>
                        </div>
                        <div class="info-card">
                            <div class="info-title">🏢 Setor</div>
                            <div class="info-value">${os.setor || 'Não especificado'}</div>
                        </div>
                        <div class="info-card">
                            <div class="info-title">⚙️ Equipamento</div>
                            <div class="info-value">${os.equipamento || 'Não identificado'}</div>
                        </div>
                        <div class="info-card">
                            <div class="info-title">🔧 Técnico Responsável</div>
                            <div class="info-value">${tecnico?.nome || 'Não atribuído'}</div>
                        </div>
                        <div class="info-card">
                            <div class="info-title">📅 Data de Abertura</div>
                            <div class="info-value">${new Date(os.dataAbertura).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="info-card">
                            <div class="info-title">⏱️ Data de Início</div>
                            <div class="info-value">${os.dataInicio ? new Date(os.dataInicio).toLocaleString('pt-BR') : 'Aguardando início'}</div>
                        </div>
                    </div>

                    <div class="description-section">
                        <div class="description-card">
                            <div class="description-title">📝 Descrição Detalhada do Problema</div>
                            <div class="description-text">${os.descricao || 'Nenhuma descrição foi fornecida para esta ordem de serviço.'}</div>
                        </div>
                    </div>

                    <div class="footer">
                        <div class="footer-content">
                            <div class="footer-left">
                                <span>🏢 Embalagens Tatuí</span>
                                <span>•</span>
                                <span>OS #${os.id}</span>
                            </div>
                            <div class="footer-right">
                                Página ${index + 1} de ${osParaExportar.length}
                            </div>
                        </div>
                    </div>
                </div>
            `;
    }).join('')}
    </div>

    <script>
        function getStatusText(status) {
            const statusMap = {
                'pendente': 'Pendente',
                'andamento': 'Em Andamento',
                'concluida': 'Concluída',
                'cancelada': 'Cancelada'
            };
            return statusMap[status] || status;
        }

        function getPriorityText(prioridade) {
            const priorityMap = {
                'baixa': 'Baixa',
                'media': 'Média',
                'alta': 'Alta',
                'critica': 'Crítica'
            };
            return priorityMap[prioridade] || prioridade;
        }
    </script>
<script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'97b7ce10f6dfc1b6',t:'MTc1NzI2NDg3My4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script></body>
</html>

    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = function () {
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    };
}

function limparFiltros() {
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroPrioridade').value = '';
    document.getElementById('filtroBusca').value = '';
    filtrarOS();
}

window.Concluida = function (id) {
    const os = (typeof ordensServico !== 'undefined') ? ordensServico.find(o => o.id === id) : null;
    if (!os) { console.warn('OS não encontrada', id); return; }
    if (!confirm(`Marcar a OS #${id} como concluída?`)) return;
    os.status = 'concluida';
    os.dataConclusao = new Date().toISOString();
    if (typeof salvarDados === 'function') salvarDados();
    if (typeof carregarListaOS === 'function') carregarListaOS();
    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    if (typeof mostrarToast === 'function') mostrarToast(`OS #${id} concluída com sucesso!`);
};

window.editarOSModal = function (id) {
    const os = (typeof ordensServico !== 'undefined') ? ordensServico.find(o => o.id === id) : null;
    if (!os) { console.warn('OS não encontrada', id); return; }

    // Identificações no header do modal
    document.getElementById('modal-header').textContent = `Editando OS #${id}`;
    document.getElementById('modal-os-id').textContent = id;
    document.getElementById('modal-os-solicitante').textContent = os.solicitante || '';
    document.getElementById('modal-os-setor').textContent = os.setor || '';

    // Campos editáveis
    document.getElementById('modal-solicitante').value = os.solicitante || '';
    document.getElementById('modal-setor').value = os.setor || '';
    document.getElementById('modal-equipamento').value = os.equipamento || '';
    document.getElementById('modal-descricao').value = os.descricao || '';

    // Guardar id da OS sendo editada
    window.osEditandoId = id;

    // Mostrar modal
    document.getElementById('modalEdicaoOS').classList.remove('hidden');
};

window.salvarEdicaoModal = function () {
    const id = window.osEditandoId;
    const os = ordensServico.find(o => o.id === id);
    if (!os) return;

    os.solicitante = document.getElementById('modal-solicitante').value;
    os.setor = document.getElementById('modal-setor').value;
    os.equipamento = document.getElementById('modal-equipamento').value;
    os.descricao = document.getElementById('modal-descricao').value;

    salvarDados();       // atualiza storage/backend
    carregarListaOS();   // recarrega os cards
    mostrarToast(`OS #${id} atualizada com sucesso!`);
    fecharModalEdicao();
};
window.fecharModalEdicao = function () {
    document.getElementById('modalEdicaoOS').classList.add('hidden');
};

window.atribuirTecnico = function (id) {
    const os = (typeof ordensServico !== 'undefined') ? ordensServico.find(o => o.id === id) : null;
    if (!os) { console.warn('OS não encontrada', id); return; }

    // Prompt simples (para protótipo). Recomendo trocar por modal depois.
    const tecnicoId = prompt("Digite o ID do técnico para atribuir à OS #" + id + ":");
    if (!tecnicoId) return;
    const tecnico = (typeof tecnicos !== 'undefined') ? tecnicos.find(t => t.id == tecnicoId) : null;
    if (!tecnico) {
        if (typeof mostrarToast === 'function') mostrarToast("Técnico não encontrado!", "error");
        return;
    }

    os.tecnicoId = tecnico.id;
    if (os.status === 'pendente') os.status = 'andamento';

    if (typeof salvarDados === 'function') salvarDados();
    if (typeof carregarListaOS === 'function') carregarListaOS();
    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    if (typeof mostrarToast === 'function') mostrarToast(`Técnico ${tecnico.nome} atribuído à OS #${id}!`);
};

window.excluirOS = function (id) {
    if (!confirm(`Tem certeza que deseja excluir a OS #${id}?`)) return;
    if (typeof ordensServico === 'undefined') { console.warn('ordensServico indefinido'); return; }

    ordensServico = ordensServico.filter(o => o.id !== id);

    if (typeof salvarDados === 'function') salvarDados();
    if (typeof carregarListaOS === 'function') carregarListaOS();
    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    if (typeof mostrarToast === 'function') mostrarToast(`OS #${id} excluída com sucesso!`);
};
function exportarPDFMecanicos() {
    // Verifica se existe a variável global de ordens (ajuste conforme seu sistema)
    let todasOrdens = [];

    // Tenta diferentes nomes de variáveis que podem existir no seu sistema
    if (typeof ordens !== 'undefined') {
        todasOrdens = ordens;
    } else if (typeof ordensServico !== 'undefined') {
        todasOrdens = ordensServico;
    } else if (typeof listaOrdens !== 'undefined') {
        todasOrdens = listaOrdens;
    } else {
        // Se não encontrar, tenta pegar do localStorage
        const ordensStorage = localStorage.getItem('ordens') || localStorage.getItem('ordensServico');
        if (ordensStorage) {
            todasOrdens = JSON.parse(ordensStorage);
        } else {
            alert('Nenhuma ordem de serviço encontrada no sistema!');
            return;
        }
    }

    // Pega os dados filtrados atuais
    const mecanicoSelecionado = document.getElementById('filtroMecanicoAdmin').value;
    const statusSelecionado = document.getElementById('filtroStatusAdmin').value;
    const buscaTexto = document.getElementById('filtroBuscaAdmin').value.toLowerCase();

    // Filtra as OS baseado nos critérios atuais
    let osFiltradas = todasOrdens.filter(os => {
        let passaMecanico = !mecanicoSelecionado || os.tecnicoId === mecanicoSelecionado;
        let passaStatus = !statusSelecionado || os.status === statusSelecionado;
        let passaBusca = !buscaTexto ||
            os.id.toString().includes(buscaTexto) ||
            (os.equipamento && os.equipamento.toLowerCase().includes(buscaTexto)) ||
            (os.setor && os.setor.toLowerCase().includes(buscaTexto)) ||
            (os.solicitante && os.solicitante.toLowerCase().includes(buscaTexto));

        return passaMecanico && passaStatus && passaBusca;
    });

    if (osFiltradas.length === 0) {
        alert('Nenhuma OS encontrada com os filtros aplicados!');
        return;
    }

    // Cria o HTML do PDF
    const htmlPDF = gerarHTMLPDFMecanicos(osFiltradas);

    // Abre em nova janela para impressão/download
    const novaJanela = window.open('', '_blank');
    novaJanela.document.write(htmlPDF);
    novaJanela.document.close();

    // Aguarda carregar e imprime
    novaJanela.onload = function () {
        setTimeout(() => {
            novaJanela.print();
        }, 500);
    };
}

function gerarHTMLPDFMecanicos(osParaExportar) {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Verifica se existe a variável de técnicos
    let listaTecnicos = [];
    if (typeof tecnicos !== 'undefined') {
        listaTecnicos = tecnicos;
    } else if (typeof mecanicos !== 'undefined') {
        listaTecnicos = mecanicos;
    } else {
        // Tenta pegar do localStorage
        const tecnicosStorage = localStorage.getItem('tecnicos') || localStorage.getItem('mecanicos');
        if (tecnicosStorage) {
            listaTecnicos = JSON.parse(tecnicosStorage);
        }
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Gestão de Mecânicos</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.5;
            color: #1f2937;
            background: white;
            padding: 20px;
        }

        @page {
            size: A4;
            margin: 0;
        }

        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            
            body {
                background: white !important;
                margin: 0;
                padding: 20px;
            }
            
            .no-break {
                break-inside: avoid;
                page-break-inside: avoid;
            }
        }

        .container {
            width: 100%;
            max-width: none;
            margin: 0;
            background: white;
            padding: 0;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #0a1f44 0%, #1e3a8a 50%, #2563eb 100%);
            color: white;
            padding: 30px;
            position: relative;
            overflow: hidden;
            margin-bottom: 30px;
            border-radius: 15px;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 120px;
            height: 120px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            transform: translate(40px, -40px);
        }

        .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            z-index: 2;
        }

       

        .company-info {
            flex: 1;
            text-align: center;
            margin: 0 20px;
        }

        .company-name {
            font-size: 32px;
            font-weight: 800;
            color: white;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .report-title {
            font-size: 18px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .header-date {
            text-align: right;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
        }

        /* Resumo Executivo */
        .resumo {
            background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            border: 2px solid #e2e8f0;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .resumo-title {
            font-size: 20px;
            font-weight: 700;
            color: #1e3a8a;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
        }

        .stat-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .stat-number {
            font-size: 24px;
            font-weight: 800;
            color: #1e3a8a;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
        }

        /* Lista de OS */
        .os-list {
            margin-bottom: 30px;
        }

        .os-item {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            position: relative;
        }

        .os-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(135deg, #0a1f44, #2563eb);
            border-radius: 2px 0 0 2px;
        }

        .os-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .os-id {
            font-size: 18px;
            font-weight: 700;
            color: #1e3a8a;
        }

        .os-status {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-pendente { background: #fef3c7; color: #92400e; }
        .status-andamento { background: #dbeafe; color: #1e40af; }
        .status-concluida { background: #d1fae5; color: #065f46; }
        .status-cancelada { background: #fee2e2; color: #991b1b; }

        .os-details {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            font-size: 12px;
        }

        .detail-item {
            display: flex;
            flex-direction: column;
        }

        .detail-label {
            font-weight: 600;
            color: #64748b;
            margin-bottom: 3px;
        }

        .detail-value {
            font-weight: 500;
            color: #1f2937;
        }

        /* Footer */
        .footer {
            margin-top: 40px;
            padding: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 10px;
        }

        .footer-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
        }

        /* Responsivo */
        @media screen and (max-width: 768px) {
            .header-content {
                flex-direction: column;
                text-align: center;
                gap: 15px;
            }
            
            .company-info {
                margin: 0;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .os-details {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .footer-content {
                flex-direction: column;
                gap: 5px;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header no-break">
            <div class="header-content">
                <div class="company-info">
                    <div class="company-name">Embalagens Tatuí</div>
                    <div class="report-title">Relatório de Gestão de Mecânicos</div>
                </div>
                <div class="header-date">
                    <div>📅 ${dataAtual}</div>
                    <div>🕐 ${horaAtual}</div>
                </div>
            </div>
        </div>

        <div class="resumo no-break">
            <div class="resumo-title">
                📊 Resumo Executivo
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${osParaExportar.length}</div>
                    <div class="stat-label">Total de OS</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${osParaExportar.filter(os => os.status === 'pendente').length}</div>
                    <div class="stat-label">Pendentes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${osParaExportar.filter(os => os.status === 'andamento').length}</div>
                    <div class="stat-label">Em Andamento</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${osParaExportar.filter(os => os.status === 'concluida').length}</div>
                    <div class="stat-label">Concluídas</div>
                </div>
            </div>
        </div>

        <div class="os-list">
            ${osParaExportar.map((os, index) => {
        const tecnico = listaTecnicos.find(t => t.id === os.tecnicoId);
        return `
                    <div class="os-item no-break">
                        <div class="os-header">
                            <div class="os-id">OS #${os.id}</div>
                            <div class="os-status status-${os.status}">${getStatusText(os.status)}</div>
                        </div>
                        <div class="os-details">
                            <div class="detail-item">
                                <div class="detail-label">👤 Solicitante</div>
                                <div class="detail-value">${os.solicitante || 'Não informado'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">🏢 Setor</div>
                                <div class="detail-value">${os.setor || 'Não especificado'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">⚙️ Equipamento</div>
                                <div class="detail-value">${os.equipamento || 'Não identificado'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">🔧 Técnico</div>
                                <div class="detail-value">${tecnico?.nome || 'Não atribuído'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">📅 Data Abertura</div>
                                <div class="detail-value">${new Date(os.dataAbertura).toLocaleDateString('pt-BR')}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">🔰 Prioridade</div>
                                <div class="detail-value">${getPriorityText(os.prioridade)}</div>
                            </div>
                        </div>
                        ${os.descricao ? `
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                                <div class="detail-label">📝 Descrição</div>
                                <div style="font-size: 11px; color: #4b5563; margin-top: 5px; line-height: 1.4;">${os.descricao}</div>
                            </div>
                        ` : ''}
                    </div>
                `;
    }).join('')}
        </div>

        <div class="footer no-break">
            <div class="footer-content">
                <div>🏢 Embalagens Tatuí - Relatório de Gestão de Mecânicos</div>
                <div>Gerado em ${dataAtual} às ${horaAtual}</div>
            </div>
        </div>
    </div>

    <script>
        function getStatusText(status) {
            const statusMap = {
                'pendente': 'Pendente',
                'andamento': 'Em Andamento',
                'concluida': 'Concluída',
                'cancelada': 'Cancelada'
            };
            return statusMap[status] || status;
        }

        function getPriorityText(prioridade) {
            const priorityMap = {
                'baixa': 'Baixa',
                'media': 'Média',
                'alta': 'Alta',
                'critica': 'Crítica'
            };
            return priorityMap[prioridade] || prioridade;
        }
    </script>
</body>
</html>
    `;
}

function atualizarContadorOSMecanicos() {
    const contador = document.getElementById('contadorOSMecanicos');
    if (contador) {
        const totalOS = document.querySelectorAll('#todasOSMecanicos .os-card').length;
        contador.textContent = `${totalOS} OS`;
    }
}

function atualizarContadorOSMecanicos() {
    const contador = document.getElementById('contadorOSMecanicos');
    if (contador) {
        const totalOS = document.querySelectorAll('#todasOSMecanicos .os-card').length;
        contador.textContent = `${totalOS} OS`;
    }
}

document.getElementById('forgotPasswordBtn')?.addEventListener('click', () => {
    document.getElementById('forgotPasswordModal').classList.remove('hidden');
});

document.getElementById('sendForgotRequest')?.addEventListener('click', async () => {
    const usuario = document.getElementById('forgotUser').value.trim();
    if (!usuario) {
        mostrarToast('Digite o usuário ou e-mail!', 'error');
        return;
    }

    // Verificar se o usuário existe no sistema
    const usuarioExiste = usuarios.find(u => u.usuario === usuario || u.email === usuario);
    if (!usuarioExiste) {
        mostrarToast('Usuário não encontrado no sistema!', 'error');
        return;
    }

    const solicitacao = {
        usuario,
        dataSolicitacao: new Date().toISOString(),
        status: 'pendente'
    };

    try {
        await fetch(`${FIREBASE_URL}/solicitacoesSenha.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solicitacao)
        });
        mostrarToast('Solicitação enviada com sucesso!');
        document.getElementById('forgotPasswordModal').classList.add('hidden');
        document.getElementById('forgotUser').value = '';
    } catch (error) {
        console.error('Erro ao enviar solicitação:', error);
        mostrarToast('Erro ao enviar solicitação!', 'error');
    }
});

async function carregarSolicitacoesSenha() {
    try {
        const resp = await fetch(`${FIREBASE_URL}/solicitacoesSenha.json`);
        if (!resp.ok) return;
        const dados = await resp.json();
        const lista = document.getElementById('listaSolicitacoesSenha');
        lista.innerHTML = '';

        if (!dados) {
            lista.innerHTML = '<p class="text-gray-500 text-sm">Nenhuma solicitação.</p>';
            return;
        }

        Object.entries(dados).forEach(([id, sol]) => {
            const card = document.createElement('div');
            card.className = 'p-4 bg-white shadow rounded-xl flex justify-between items-center';

            card.innerHTML = `
              <div>
                <p class="font-medium text-gray-800">${sol.usuario}</p>
                <p class="text-xs text-gray-500">Data: ${new Date(sol.dataSolicitacao).toLocaleString('pt-BR')}</p>
                <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs ${sol.status === 'pendente' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
                  ${sol.status}
                </span>
              </div>
              <div class="flex gap-2">
                ${sol.status === 'pendente' ? `
                  <button onclick="abrirResetSenha('${id}', '${sol.usuario}')"
                          class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Redefinir
                  </button>` : ''}
              </div>
            `;

            lista.appendChild(card);
        });
    } catch (error) {
        console.error('Erro ao carregar solicitações:', error);
    }
}

function abrirResetSenha(id, usuario) {
    const novaSenha = prompt(`Digite a nova senha para o usuário ${usuario}:`);
    if (!novaSenha || novaSenha.length < 3) {
        mostrarToast('Senha inválida (mínimo 3 caracteres)', 'error');
        return;
    }
    redefinirSenhaUsuario(id, usuario, novaSenha);
}

async function redefinirSenhaUsuario(id, usuario, novaSenha) {
    try {
        // Atualizar senha do usuário no array e salvar
        const user = usuarios.find(u => u.usuario === usuario);
        if (user) user.senha = novaSenha;
        await salvarDados();

        // Marcar solicitação como resolvida no Firebase
        await fetch(`${FIREBASE_URL}/solicitacoesSenha/${id}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'resolvido',
                resolvidoEm: new Date().toISOString()
            })
        });

        mostrarToast('Senha redefinida com sucesso!');
        carregarSolicitacoesSenha();
        carregarListaUsuarios();
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        mostrarToast('Erro ao redefinir senha!', 'error');
    }
}
document.addEventListener('DOMContentLoaded', function () {
    // Detectar dispositivos com baixa performance
    const isLowPerformance = navigator.hardwareConcurrency <= 2 ||
        navigator.deviceMemory <= 2 ||
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isLowPerformance) {
        // Reduzir animações em dispositivos fracos
        document.documentElement.style.setProperty('--animation-duration', '0.1s');

        // Remover algumas animações complexas
        const elements = document.querySelectorAll('.hover\\:scale-\\[1\\.02\\]');
        elements.forEach(el => {
            el.classList.remove('hover:scale-[1.02]');
            el.classList.add('hover:opacity-90');
        });
    }
});

let chatsList = [];
let chatAtivoId = null;
let mensagensCache = Object.create(null);
let chatPollTimer = null;

const CHAT_POLL_INTERVAL = 2000; // 2s
const __msgsHash = Object.create(null);

let __listaSignature = '';
let __conversaReqCtrl = null;
let __msgsReqCtrl = null;

const __fmtTime = ts => ts ? new Date(ts).toLocaleString() : '';
const __itemSig = c => `${c.id}|${c.ultimoTimestamp || 0}|${c.ultimoTexto || ''}`;

function __debounce(fn, delay) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
    };
}

function gerarChatId(userA, userB) {
    const a = String(userA || '').trim().toLowerCase();
    const b = String(userB || '').trim().toLowerCase();
    if (!a && !b) return `anon_${Date.now()}`;
    if (a === b) return `${a}_${Date.now()}`;
    return (a < b) ? `${a}_${b}` : `${b}_${a}`;
}
function inicializarChat() {
    // --- Carregamento inicial ---
    carregarListaConversasUsuario();
    preencherSelectUsuariosPara();

    // --- Admin: polling global ---
    if (usuarioLogado?.tipo === 'admin') {
        clearInterval(window.__adminPoll);
        window.__adminPoll = setInterval(carregarTodasConversas, 8000); // maior intervalo = menos bateria
    }

    // --- Placeholder inicial ---
    const nameEl = document.getElementById('chatHeaderName');
    const lastEl = document.getElementById('chatHeaderLast');
    const avatarEl = document.getElementById('chatHeaderAvatar');

    if (nameEl) nameEl.textContent = 'Selecione uma conversa';
    if (lastEl) lastEl.textContent = 'Última mensagem';
    if (avatarEl) {
        avatarEl.src = '';
        avatarEl.alt = 'avatar';
        avatarEl.style.background = '#e2e8f0';
        avatarEl.onerror = () => {
            avatarEl.src = '';
            avatarEl.alt = 'Sem avatar';
            avatarEl.style.background = '#e2e8f0';
        };
    }

    // --- Polling inteligente ---
    const startChatPolling = () => {
        if (chatPollTimer) clearInterval(chatPollTimer);
        if (!chatAtivoId) return;
        chatPollTimer = setInterval(() => carregarMensagens(chatAtivoId, false), CHAT_POLL_INTERVAL_MOBILE);
    };

    const stopChatPolling = () => {
        if (chatPollTimer) {
            clearInterval(chatPollTimer);
            chatPollTimer = null;
        }
    };

    // --- Pausar quando aba não ativa ---
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopChatPolling();
        else startChatPolling();
    });

    // --- Detectar background/foreground no Android ---
    window.addEventListener('blur', stopChatPolling);
    window.addEventListener('focus', startChatPolling);

    // --- Auto iniciar polling se já tiver chat aberto ---
    if (chatAtivoId) startChatPolling();
}

/* Constantes diferenciadas para desktop x mobile */
const CHAT_POLL_INTERVAL_DESKTOP = 4000;
const CHAT_POLL_INTERVAL_MOBILE = 7000; // menos requisições em mobile


function preencherSelectUsuariosPara() {
    const select = document.getElementById('selectUsuarioPara');
    if (!select) return;

    const frag = document.createDocumentFragment();
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Selecione usuário';
    frag.appendChild(def);

    const me = (usuarioLogado && usuarioLogado.usuario) || '';

    (usuarios || []).forEach(u => {
        // 🔹 ignora vazio, o próprio usuário logado e qualquer admin
        if (!u || u.usuario === me || u.tipo === 'admin') return;

        const opt = document.createElement('option');
        opt.value = u.usuario;
        opt.textContent = `${u.nome} (${u.usuario})`;
        frag.appendChild(opt);
    });

    select.textContent = '';
    select.appendChild(frag);
}

async function criarConversaComSelecionado() {
    const sel = document.getElementById('selectUsuarioPara');
    const to = sel ? sel.value : '';
    if (!to) {
        if (typeof mostrarToast === 'function') mostrarToast('Selecione usuário', 'error');
        return;
    }

    const chatId = gerarChatId(usuarioLogado.usuario, to);

    const usuarioAtual = usuarios.find(u => u.usuario === usuarioLogado.usuario);
    const outroUsuario = usuarios.find(u => u.usuario === to);

    const novoChat = {
        id: chatId,
        membros: [usuarioLogado.usuario, to],
        nomes: {
            [usuarioLogado.usuario]: usuarioAtual?.nome || usuarioLogado.usuario,
            [to]: outroUsuario?.nome || to
        },
        ultimoTexto: '',
        ultimoTimestamp: Date.now(),
        lidos: {}
    };

    try {
        await fetch(`${FIREBASE_URL}/chats/${chatId}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoChat)
        });
        if (!chatsList.find(c => c.id === chatId)) chatsList.unshift(novoChat);
        renderListaConversas();

        document.getElementById('novaConversaModal')?.classList.add('hidden');
        abrirConversa(chatId);

    } catch (e) {
        console.error('criarConversaComSelecionado', e);
        if (typeof mostrarToast === 'function') mostrarToast('Erro ao criar conversa', 'error');
    }
}
async function carregarListaConversasUsuario() {
    if (!usuarioLogado?.usuario) return;

    try {
        const res = await fetch(`${FIREBASE_URL}/chats.json`);
        const allChats = await res.json();
        if (!allChats) {
            chatsList = [];
            renderListaConversas();
            return;
        }

        // 🔥 Filtro + sort direto em um único fluxo
        chatsList = Object.values(allChats)
            .filter(c => c?.membros?.includes(usuarioLogado.usuario))
            .sort((a, b) => (b.ultimoTimestamp ?? 0) - (a.ultimoTimestamp ?? 0));

        normalizarChatsComNomes();
        renderListaConversas();

    } catch (e) {
        console.error("Erro carregarListaConversasUsuario:", e);
    }
}
async function carregarTodasConversas() {
    try {
        const res = await fetch(`${FIREBASE_URL}/chats.json`);
        const allChats = await res.json();

        chatsList = allChats
            ? Object.values(allChats)
                .sort((a, b) => (b?.ultimoTimestamp ?? 0) - (a?.ultimoTimestamp ?? 0))
            : [];

        normalizarChatsComNomes();
        renderListaConversas();

    } catch (e) {
        console.error("Erro carregarTodasConversas:", e);
    }
}


function normalizarChatsComNomes() {
    for (const c of chatsList) {
        if (!c.nomes && c.membros) {
            c.nomes = {};
            for (const m of c.membros) {
                const u = (usuarios || []).find(x => x.usuario === m);
                c.nomes[m] = u?.nome || m;
            }
        }
    }
}
let __usuariosCache = new Map();
let __titlesCache = new Map();
let __conversasHTML = new Map();
let __lastConversasHash = '';

function renderListaConversas() {
    const container = document.getElementById('conversasList');
    if (!container || !chatsList?.length) return;

    // Hash mais eficiente
    const quickHash = (chatsList.length << 16) | ((chatsList[0]?.ultimoTimestamp ?? 0) & 0xFFFF);
    if (__lastConversasHash === quickHash) return;
    __lastConversasHash = quickHash;

    // Cache de usuários otimizado
    if (__usuariosCache.size === 0 && usuarios?.length) {
        for (let i = 0; i < usuarios.length; i++) {
            const u = usuarios[i];
            __usuariosCache.set(u.usuario, u.nome || u.usuario);
        }
    }

    const isAdmin = usuarioLogado?.tipo === 'admin';
    const currentUser = usuarioLogado?.usuario;

    // Para admin: renderização em batches para evitar travamento
    if (isAdmin && chatsList.length > 50) {
        renderListaConversasAsync(container, isAdmin, currentUser);
        return;
    }

    // Renderização normal para usuários comuns ou listas pequenas
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < chatsList.length; i++) {
        const chat = chatsList[i];
        const chatKey = `${chat.id}_${chat.ultimoTimestamp ?? 0}`;

        let chatHTML = __conversasHTML.get(chatKey);
        if (!chatHTML) {
            let title = __titlesCache.get(chat.id);
            if (!title) {
                if (isAdmin && chat.nomes) {
                    // Otimização para admin: limitar nomes longos
                    const nomes = Object.values(chat.nomes);
                    title = nomes.length > 2 ? `${nomes[0]} ↔ ${nomes[1]} +${nomes.length-2}` : nomes.join(' ↔ ');
                } else {
                    const outro = chat.membros?.find(m => m !== currentUser) || chat.membros?.[0] || 'Desconhecido';
                    title = __usuariosCache.get(outro) || outro;
                }
                __titlesCache.set(chat.id, title);
            }

            const last = chat.ultimoTexto || '';
            const when = __fmtTime(chat.ultimoTimestamp ?? 0);
            
            // Template otimizado com innerHTML (mais rápido)
            const div = document.createElement('div');
            div.className = 'p-2 rounded hover:bg-slate-100 cursor-pointer flex items-center gap-3 transition-colors';
            
            div.innerHTML = `
                <img class="w-10 h-10 rounded-full" alt="avatar" 
                     src="https://ui-avatars.com/api/?name=${encodeURIComponent(title.slice(0, 20))}&background=0D8ABC&color=fff">
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <div class="font-medium truncate pr-2">${title}</div>
                        <div class="text-xs text-gray-500 flex-shrink-0">${when}</div>
                    </div>
                    <div class="text-sm text-gray-600 truncate">${last}</div>
                </div>
            `;
            
            const chatId = chat.id;
            div.onclick = () => abrirConversa(chatId);
            
            chatHTML = div;
            __conversasHTML.set(chatKey, chatHTML);
        } else {
            chatHTML = chatHTML.cloneNode(true);
            const chatId = chat.id;
            chatHTML.onclick = () => abrirConversa(chatId);
        }

        fragment.appendChild(chatHTML);
    }

    container.replaceChildren(fragment);
    console.log(`📱 Lista renderizada: ${chatsList.length} conversas`);
}

// Renderização assíncrona para admin com muitas conversas
function renderListaConversasAsync(container, isAdmin, currentUser) {
    const BATCH_SIZE = 25;
    let currentBatch = 0;
    
    function processBatch() {
        const start = currentBatch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, chatsList.length);
        const fragment = document.createDocumentFragment();
        
        for (let i = start; i < end; i++) {
            const chat = chatsList[i];
            const chatKey = `${chat.id}_${chat.ultimoTimestamp ?? 0}`;

            let chatHTML = __conversasHTML.get(chatKey);
            if (!chatHTML) {
                let title = __titlesCache.get(chat.id);
                if (!title) {
                    if (isAdmin && chat.nomes) {
                        const nomes = Object.values(chat.nomes);
                        title = nomes.length > 2 ? `${nomes[0]} ↔ ${nomes[1]} +${nomes.length-2}` : nomes.join(' ↔ ');
                    } else {
                        const outro = chat.membros?.find(m => m !== currentUser) || chat.membros?.[0] || 'Desconhecido';
                        title = __usuariosCache.get(outro) || outro;
                    }
                    __titlesCache.set(chat.id, title);
                }

                const last = chat.ultimoTexto || '';
                const when = __fmtTime(chat.ultimoTimestamp ?? 0);
                
                const div = document.createElement('div');
                div.className = 'p-2 rounded hover:bg-slate-100 cursor-pointer flex items-center gap-3 transition-colors';
                
                div.innerHTML = `
                    <img class="w-10 h-10 rounded-full" alt="avatar" 
                         src="https://ui-avatars.com/api/?name=${encodeURIComponent(title.slice(0, 20))}&background=0D8ABC&color=fff">
                    <div class="flex-1">
                        <div class="flex items-center justify-between">
                            <div class="font-medium truncate pr-2">${title}</div>
                            <div class="text-xs text-gray-500 flex-shrink-0">${when}</div>
                        </div>
                        <div class="text-sm text-gray-600 truncate">${last}</div>
                    </div>
                `;
                
                const chatId = chat.id;
                div.onclick = () => abrirConversa(chatId);
                
                chatHTML = div;
                __conversasHTML.set(chatKey, chatHTML);
            } else {
                chatHTML = chatHTML.cloneNode(true);
                const chatId = chat.id;
                chatHTML.onclick = () => abrirConversa(chatId);
            }

            fragment.appendChild(chatHTML);
        }

        if (currentBatch === 0) {
            container.replaceChildren(fragment);
        } else {
            container.appendChild(fragment);
        }

        currentBatch++;
        
        if (end < chatsList.length) {
            requestAnimationFrame(processBatch);
        } else {
            console.log(`📱 Lista admin renderizada: ${chatsList.length} conversas em batches`);
        }
    }
    
    requestAnimationFrame(processBatch);
}

// Função para limpar caches quando necessário
function limparCachesConversas() {
    __conversasHTML.clear();
    __titlesCache.clear();
    __usuariosCache.clear();
    __lastConversasHash = '';
    console.log('🧹 Caches de conversas limpos');
}




async function abrirConversa(chatId) {
    chatAtivoId = chatId;

    // token de corrida: só a última abertura é válida
    const thisOpenId = chatId;
    abrirConversa.ultimoToken = thisOpenId;

    // aborta fetch anterior se existir
    if (__conversaReqCtrl) { try { __conversaReqCtrl.abort(); } catch (_) { } }
    __conversaReqCtrl = new AbortController();

    const nameEl = document.getElementById('chatHeaderName');
    const avatarEl = document.getElementById('chatHeaderAvatar');
    const lastEl = document.getElementById('chatHeaderLast');

    if (nameEl) nameEl.textContent = 'Carregando...';
    if (lastEl) lastEl.textContent = '';
    if (avatarEl) {
        avatarEl.src = '';
        avatarEl.classList.add('hidden');
    }

    let meta = chatsList.find(c => c.id === chatId);

    if (!meta) {
        try {
            const r = await fetch(`${FIREBASE_URL}/chats/${chatId}.json`, { signal: __conversaReqCtrl.signal });
            meta = await r.json();
        } catch (e) {
            if (e.name !== 'AbortError') console.error('abrirConversa meta', e);
            return;
        }
    }

    // se enquanto carregava o usuário clicou em outro chat, ignorar este resultado
    if (abrirConversa.ultimoToken !== thisOpenId) return;

    if (meta) {
        const outro = meta.membros.find(m => m !== usuarioLogado.usuario) || meta.membros[0];
        const userObj = (usuarios || []).find(u => u.usuario === outro) || { nome: outro };

        if (nameEl) nameEl.textContent = userObj.nome || outro;
        if (avatarEl) {
            avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userObj.nome || outro)}&background=0D8ABC&color=fff`;
            avatarEl.classList.remove('hidden');
        }
        if (lastEl) lastEl.textContent = meta.ultimoTexto || '';
    }

    await carregarMensagens(chatId, true);

    // inicia polling
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(() => {
        if (chatAtivoId === chatId) carregarMensagens(chatId, false);
    }, CHAT_POLL_INTERVAL);

    // mobile: mostra painel de mensagens e esconde lista
    if (window.innerWidth < 768) {
        document.getElementById('conversasPane')?.classList.add('hidden');
        document.getElementById('mensagensPane')?.classList.remove('hidden');
    }
}

function __hashMsgs(arr) {
    if (!arr || !arr.length) return '0|0|';
    const last = arr[arr.length - 1];
    return `${arr.length}|${last.timestamp || 0}|${last.text || ''}`;
}

async function carregarMensagens(chatId, scrollToBottom = false) { // default: false, não pula o scroll
    if (!chatId) return;

    if (__msgsReqCtrl) {
        try { __msgsReqCtrl.abort(); } catch (_) {}
    }
    __msgsReqCtrl = new AbortController();

    try {
        const res = await fetch(`${FIREBASE_URL}/messages/${chatId}.json`, { signal: __msgsReqCtrl.signal });
        const msgs = await res.json() || {};

        const agora = Date.now();
        const mensagensValidas = {};
        const expiradas = [];

        // Filtrar mensagens com menos de 24h
        for (const [id, msg] of Object.entries(msgs)) {
            if (!msg.timestamp || (agora - msg.timestamp) < 86_400_000) {
                mensagensValidas[id] = msg;
            } else {
                expiradas.push(id);
            }
        }

        // Deleta as mensagens expiradas do Firebase
        for (const id of expiradas) {
            fetch(`${FIREBASE_URL}/messages/${chatId}/${id}.json`, {
                method: 'DELETE'
            }).catch(console.error);
        }

        // Ordenar e enriquecer as válidas
        const arr = Object.values(mensagensValidas)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .map(m => {
                const remetente = usuarios.find(u => u.usuario === m.from);
                return remetente ? { ...m, nome: remetente.nome, tipo: remetente.tipo } : m;
            });

        const newHash = __hashMsgs(arr);

        if (__msgsHash[chatId] !== newHash) {
            __msgsHash[chatId] = newHash;
            mensagensCache[chatId] = arr;
        }

        // Salva posição atual do scroll antes de renderizar
        const cont = document.getElementById('messagesContainer');
        const scrollAnterior = cont ? cont.scrollTop : 0;

        renderMensagens(chatId);

        // Restaurar scroll ou pular para o final se scrollToBottom = true
        if (cont) {
            requestAnimationFrame(() => {
                cont.scrollTop = scrollToBottom ? cont.scrollHeight : scrollAnterior;
            });
        }

        // Atualiza timestamp de mensagens lidas
        await fetch(`${FIREBASE_URL}/chats/${chatId}/lidos/${usuarioLogado.usuario}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
        });

    } catch (e) {
        if (e.name !== 'AbortError') console.error('carregarMensagens', e);
    }
}



// Cache global para mensagens renderizadas
let __mensagensHTMLCache = new Map();
let __remetentesGlobalCache = new Map();
let __lastChatId = null;
let __containerMensagens = null;

function renderMensagens(chatId) {
    // Cache do container
    if (!__containerMensagens) {
        __containerMensagens = document.getElementById('messagesContainer');
    }
    const container = __containerMensagens;
    if (!container) return;

    const msgs = mensagensCache[chatId] || [];
    if (!msgs.length) {
        container.textContent = '';
        return;
    }

    const isAdmin = usuarioLogado?.tipo === 'admin';
    const currentUser = usuarioLogado?.usuario;

    // Para admin com muitas mensagens: renderização virtual/paginada
    if (isAdmin && msgs.length > 100) {
        renderMensagensVirtual(container, msgs, chatId, currentUser);
        return;
    }

    // Renderização normal para usuários comuns ou poucas mensagens
    renderMensagensNormal(container, msgs, chatId, currentUser);
}

function renderMensagensNormal(container, msgs, chatId, currentUser) {
    // Preenche cache de remetentes só 1x
    if (__remetentesGlobalCache.size === 0 && Array.isArray(usuarios)) {
        for (let u of usuarios) {
            __remetentesGlobalCache.set(
                u.usuario,
                { nome: u.nome || u.usuario, tipo: u.tipo || 'user' }
            );
        }
    }

    const templates = {
        me: {
            wrapper: 'flex mb-2 justify-end',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none',
            header: 'text-xs font-semibold mb-1 text-blue-100',
            stamp: 'text-[10px] mt-1 text-right text-blue-200'
        },
        other: {
            wrapper: 'flex mb-2 justify-start',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-white text-gray-800 border border-gray-200 rounded-bl-none',
            header: 'text-xs font-semibold mb-1 text-gray-500',
            stamp: 'text-[10px] mt-1 text-right text-gray-400'
        }
    };

    const frag = document.createDocumentFragment();

    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const msgKey = `${chatId}_${m.timestamp}_${m.from}`;

        let msgHTML = __mensagensHTMLCache.get(msgKey);

        if (!msgHTML) {
            const isMe = m.from === currentUser;
            const template = isMe ? templates.me : templates.other;

            let remetente = __remetentesGlobalCache.get(m.from);
            if (!remetente) {
                remetente = { nome: m.from, tipo: 'desconhecido' };
                __remetentesGlobalCache.set(m.from, remetente);
            }

            // Cacheia também o horário formatado (não recalcula sempre)
            const time = m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '';
            const headerText = isMe
                ? `Você (${remetente.tipo})`
                : `${remetente.nome} (${remetente.tipo})`;

            const wrapper = document.createElement('div');
            wrapper.className = template.wrapper;
            wrapper.innerHTML =
                `<div class="${template.div}">
                    <div class="${template.header}">${headerText}</div>
                    <div class="text-sm leading-snug whitespace-pre-wrap">${m.text || ''}</div>
                    <div class="${template.stamp}">${time}</div>
                </div>`;

            msgHTML = wrapper;
            __mensagensHTMLCache.set(msgKey, msgHTML); // guarda pronto
        }

        frag.appendChild(msgHTML.cloneNode(true)); // clona só na hora de usar
    }

    // Substitui de forma leve
    container.innerHTML = '';
    container.appendChild(frag);

    // Só faz scroll se realmente houver mensagens
    if (msgs.length) {
        container.scrollTop = container.scrollHeight;
    }
}


function renderMensagensVirtual(container, msgs, chatId, currentUser) {
    const BATCH_SIZE = 50;
    const VISIBLE_MESSAGES = 20; // mostra só as últimas mensagens

    // Pega apenas as últimas mensagens
    const recentMsgs = msgs.slice(-VISIBLE_MESSAGES);

    // Inicializa cache de remetentes só 1x
    if (__remetentesGlobalCache.size === 0 && Array.isArray(usuarios)) {
        for (let u of usuarios) {
            __remetentesGlobalCache.set(
                u.usuario,
                { nome: u.nome || u.usuario, tipo: u.tipo || 'user' }
            );
        }
    }

    const templates = {
        me: {
            wrapper: 'flex mb-2 justify-end',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none',
            header: 'text-xs font-semibold mb-1 text-blue-100',
            stamp: 'text-[10px] mt-1 text-right text-blue-200'
        },
        other: {
            wrapper: 'flex mb-2 justify-start',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-white text-gray-800 border border-gray-200 rounded-bl-none',
            header: 'text-xs font-semibold mb-1 text-gray-500',
            stamp: 'text-[10px] mt-1 text-right text-gray-400'
        }
    };

    let currentBatch = 0;
    const totalBatches = Math.ceil(recentMsgs.length / BATCH_SIZE);

    function processBatch() {
        const start = currentBatch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, recentMsgs.length);
        const frag = document.createDocumentFragment();

        for (let i = start; i < end; i++) {
            const m = recentMsgs[i];
            const msgKey = `${chatId}_${m.timestamp}_${m.from}`;

            let msgHTML = __mensagensHTMLCache.get(msgKey);

            if (!msgHTML) {
                const isMe = m.from === currentUser;
                const template = isMe ? templates.me : templates.other;

                let remetente = __remetentesGlobalCache.get(m.from);
                if (!remetente) {
                    remetente = { nome: m.from, tipo: 'desconhecido' };
                    __remetentesGlobalCache.set(m.from, remetente);
                }

                const time = new Date(m.timestamp || 0)
                    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                const headerText = isMe
                    ? `Você (${remetente.tipo})`
                    : `${remetente.nome} (${remetente.tipo})`;

                const wrapper = document.createElement('div');
                wrapper.className = template.wrapper;
                wrapper.innerHTML =
                    `<div class="${template.div}">
                        <div class="${template.header}">${headerText}</div>
                        <div class="text-sm leading-snug whitespace-pre-wrap">${m.text || ''}</div>
                        <div class="${template.stamp}">${time}</div>
                    </div>`;

                msgHTML = wrapper;
                __mensagensHTMLCache.set(msgKey, msgHTML); // guarda pronto
            }

            // clonar só quando necessário
            frag.appendChild(msgHTML.cloneNode(true));
        }

        if (currentBatch === 0) {
            // Primeira leva: limpar e colocar indicador (se houver mais mensagens antigas)
            container.innerHTML = '';

            if (msgs.length > VISIBLE_MESSAGES) {
                const indicator = document.createElement('div');
                indicator.className =
                    'text-center py-4 text-sm text-gray-500 bg-gray-50 rounded-lg mb-4 cursor-pointer hover:bg-gray-100';
                indicator.innerHTML =
                    `<i class="fas fa-chevron-up mr-2"></i>
                     Carregar mensagens anteriores (${msgs.length - VISIBLE_MESSAGES} mais)`;
                indicator.onclick = () =>
                    carregarMensagensAnteriores(chatId, msgs, container);

                frag.insertBefore(indicator, frag.firstChild);
            }

            container.appendChild(frag);
        } else {
            container.appendChild(frag);
        }

        currentBatch++;

        if (currentBatch < totalBatches) {
            requestAnimationFrame(processBatch);
        } else {
            // scroll só no final do render
            container.scrollTop = container.scrollHeight;
            console.log(`💬 Renderizadas ${recentMsgs.length}/${msgs.length} mensagens (modo virtual)`);
        }
    }

    requestAnimationFrame(processBatch);
}


function carregarMensagensAnteriores(chatId, allMsgs, container) {
    const LOAD_MORE = 50;

    // Conta mensagens reais (ignora indicador)
    const currentMsgCount = Array.from(container.children)
        .filter(c => !c.classList.contains('text-center')).length;

    const startIndex = Math.max(0, allMsgs.length - currentMsgCount - LOAD_MORE);
    const endIndex = allMsgs.length - currentMsgCount;

    const olderMsgs = allMsgs.slice(startIndex, endIndex);
    const currentUser = usuarioLogado?.usuario;

    const templates = {
        me: {
            wrapper: 'flex mb-2 justify-end',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none',
            header: 'text-xs font-semibold mb-1 text-blue-100',
            stamp: 'text-[10px] mt-1 text-right text-blue-200'
        },
        other: {
            wrapper: 'flex mb-2 justify-start',
            div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-white text-gray-800 border border-gray-200 rounded-bl-none',
            header: 'text-xs font-semibold mb-1 text-gray-500',
            stamp: 'text-[10px] mt-1 text-right text-gray-400'
        }
    };

    const frag = document.createDocumentFragment();

    for (let m of olderMsgs) {
        const msgKey = `${chatId}_${m.timestamp}_${m.from}`;
        let msgHTML = __mensagensHTMLCache.get(msgKey);

        if (!msgHTML) {
            const isMe = m.from === currentUser;
            const template = isMe ? templates.me : templates.other;

            let remetente = __remetentesGlobalCache.get(m.from);
            if (!remetente) {
                remetente = { nome: m.from, tipo: 'desconhecido' };
                __remetentesGlobalCache.set(m.from, remetente);
            }

            const time = new Date(m.timestamp || 0)
                .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const headerText = isMe
                ? `Você (${remetente.tipo})`
                : `${remetente.nome} (${remetente.tipo})`;

            // Criação mínima de elementos
            const wrapper = document.createElement('div');
            wrapper.className = template.wrapper;

            wrapper.innerHTML =
                `<div class="${template.div}">
                    <div class="${template.header}">${headerText}</div>
                    <div class="text-sm leading-snug whitespace-pre-wrap">${m.text || ''}</div>
                    <div class="${template.stamp}">${time}</div>
                </div>`;

            msgHTML = wrapper;
            __mensagensHTMLCache.set(msgKey, msgHTML); // guarda pronto
        }

        frag.appendChild(msgHTML.cloneNode(true));
    }

    // Remove indicador antigo
    const indicator = container.querySelector('.text-center');
    if (indicator) indicator.remove();

    // Adiciona novo indicador se ainda houver mais
    if (startIndex > 0) {
        const newIndicator = document.createElement('div');
        newIndicator.className =
            'text-center py-4 text-sm text-gray-500 bg-gray-50 rounded-lg mb-4 cursor-pointer hover:bg-gray-100';
        newIndicator.innerHTML =
            `<i class="fas fa-chevron-up mr-2"></i>
             Carregar mensagens anteriores (${startIndex} mais)`;
        newIndicator.onclick = () =>
            carregarMensagensAnteriores(chatId, allMsgs, container);

        frag.insertBefore(newIndicator, frag.firstChild);
    }

    // Insere no início
    container.insertBefore(frag, container.firstChild);
}


// Função para limpar cache de mensagens
function limparCacheMensagens() {
    __mensagensHTMLCache.clear();
    __remetentesGlobalCache.clear();
    __lastChatId = null;
    console.log('🧹 Cache de mensagens limpo');
}


let __sendLock = false;
let __inputCache = null;
let __pendingMessages = new Map();

async function enviarMensagemAtiva() {
    // Cache do input para evitar querySelector repetido
    if (!__inputCache) {
        __inputCache = document.getElementById('messageInput');
    }
    const inputEl = __inputCache;
    
    const text = (inputEl?.value || '').trim();
    if (!text || !chatAtivoId || __sendLock) return;

    // Gerar ID mais eficiente
    const timestamp = Date.now();
    const msg = {
        id: `${timestamp}_${(Math.random() * 1000000 | 0).toString(36)}`,
        from: usuarioLogado.usuario,
        text,
        timestamp
    };

    const updateMeta = {
        ultimoTexto: text,
        ultimoTimestamp: timestamp
    };

    // Otimização: usar push ao invés de concat (mais rápido)
    if (!mensagensCache[chatAtivoId]) {
        mensagensCache[chatAtivoId] = [];
    }
    mensagensCache[chatAtivoId].push(msg);

    // Limpar input imediatamente para melhor UX
    if (inputEl) inputEl.value = '';

    // Renderização otimizada: apenas adicionar nova mensagem ao final
    adicionarMensagemAoFinal(msg, chatAtivoId);

    // Atualização otimizada da lista de conversas
    atualizarChatMetaRapido(chatAtivoId, updateMeta);

    // Verificação offline otimizada
    if (!isOnline) {
        syncQueue.push({ type: 'chat_message', chatId: chatAtivoId, message: msg, meta: updateMeta });
        if (typeof mostrarToast === 'function') mostrarToast('📱 Sem conexão. Mensagem na fila.', 'warning');
        return;
    }

    // Lock otimizado por mensagem
    const msgKey = `${chatAtivoId}_${msg.id}`;
    if (__pendingMessages.has(msgKey)) return;
    __pendingMessages.set(msgKey, true);

    __sendLock = true;
    
    try {
        // Requests paralelos otimizados
        const [msgResponse, metaResponse] = await Promise.all([
            fetch(`${FIREBASE_URL}/messages/${chatAtivoId}/${msg.id}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg),
                signal: AbortSignal.timeout(10000) // timeout de 10s
            }),
            fetch(`${FIREBASE_URL}/chats/${chatAtivoId}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateMeta),
                signal: AbortSignal.timeout(10000)
            })
        ]);

        // Verificar se requests foram bem-sucedidos
        if (!msgResponse.ok || !metaResponse.ok) {
            throw new Error(`HTTP Error: ${msgResponse.status} / ${metaResponse.status}`);
        }

        // Marcar mensagem como enviada (opcional: adicionar indicador visual)
        marcarMensagemEnviada(msg.id);

    } catch (e) {
        console.error('❌ Erro ao enviar mensagem:', e);
        
        // Feedback específico baseado no tipo de erro
        let errorMsg = 'Erro ao enviar mensagem';
        if (e.name === 'AbortError') {
            errorMsg = 'Timeout - mensagem na fila';
        } else if (e.message.includes('HTTP Error')) {
            errorMsg = 'Erro do servidor - mensagem na fila';
        }
        
        if (typeof mostrarToast === 'function') {
            mostrarToast(`⚠️ ${errorMsg}`, 'error');
        }
        
        // Adicionar à fila de sincronização
        syncQueue.push({ 
            type: 'chat_message', 
            chatId: chatAtivoId, 
            message: msg, 
            meta: updateMeta,
            retryCount: 0,
            maxRetries: 3
        });
        
        // Marcar mensagem como pendente (opcional: indicador visual)
        marcarMensagemPendente(msg.id);
        
    } finally {
        __sendLock = false;
        __pendingMessages.delete(msgKey);
    }
}

// Função otimizada para adicionar mensagem ao final sem re-render completo
function adicionarMensagemAoFinal(msg, chatId) {
    if (!__containerMensagens) {
        __containerMensagens = document.getElementById('messagesContainer');
    }
    const container = __containerMensagens;
    if (!container || chatId !== chatAtivoId) return;

    const currentUser = usuarioLogado?.usuario;
    const isMe = msg.from === currentUser;
    
    // Cache do remetente
    let remetente = __remetentesGlobalCache.get(msg.from);
    if (!remetente) {
        remetente = { nome: msg.from, tipo: usuarioLogado?.tipo || 'user' };
        __remetentesGlobalCache.set(msg.from, remetente);
    }

    const template = isMe ? {
        wrapper: 'flex mb-2 justify-end',
        div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none',
        header: 'text-xs font-semibold mb-1 text-blue-100',
        stamp: 'text-[10px] mt-1 text-right text-blue-200'
    } : {
        wrapper: 'flex mb-2 justify-start',
        div: 'inline-block px-3 py-2 rounded-2xl shadow-md max-w-[75%] break-words bg-white text-gray-800 border border-gray-200 rounded-bl-none',
        header: 'text-xs font-semibold mb-1 text-gray-500',
        stamp: 'text-[10px] mt-1 text-right text-gray-400'
    };

    const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const headerText = isMe ? `Você (${remetente.tipo})` : `${remetente.nome} (${remetente.tipo})`;
    
    const wrapper = document.createElement('div');
    wrapper.className = template.wrapper;
    wrapper.dataset.msgId = msg.id; // Para identificar mensagem depois
    
    wrapper.innerHTML = `
        <div class="${template.div}">
            <div class="${template.header}">${headerText}</div>
            <div class="text-sm leading-snug whitespace-pre-wrap">${msg.text}</div>
            <div class="${template.stamp}">${time} <span class="sending-indicator">📤</span></div>
        </div>
    `;
    
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
}

// Função otimizada para atualizar metadata do chat
function atualizarChatMetaRapido(chatId, updateMeta) {
    // Encontrar chat de forma otimizada
    let chatIndex = -1;
    for (let i = 0; i < chatsList.length; i++) {
        if (chatsList[i].id === chatId) {
            chatIndex = i;
            break;
        }
    }
    
    if (chatIndex === -1) return;
    
    const chat = chatsList[chatIndex];
    chat.ultimoTexto = updateMeta.ultimoTexto;
    chat.ultimoTimestamp = updateMeta.ultimoTimestamp;
    
    // Reordenar apenas se necessário (se não está no topo)
    if (chatIndex > 0) {
        chatsList.splice(chatIndex, 1);
        chatsList.unshift(chat);
        
        // Re-render otimizado da lista
        requestAnimationFrame(() => renderListaConversas());
    }
}

// Funções auxiliares para indicadores visuais
function marcarMensagemEnviada(msgId) {
    const msgEl = document.querySelector(`[data-msg-id="${msgId}"] .sending-indicator`);
    if (msgEl) {
        msgEl.textContent = '✅';
        msgEl.classList.add('text-green-400');
    }
}

function marcarMensagemPendente(msgId) {
    const msgEl = document.querySelector(`[data-msg-id="${msgId}"] .sending-indicator`);
    if (msgEl) {
        msgEl.textContent = '⏳';
        msgEl.classList.add('text-yellow-400');
    }
}

// Função para limpar cache de input
function limparCacheInput() {
    __inputCache = null;
    __pendingMessages.clear();
}

const filtrarConversaLista = __debounce(() => {
    const input = document.getElementById('chatSearch');
    const container = document.getElementById('conversasList');
    if (!input || !container) return;
    const q = (input.value || '').toLowerCase();
    for (const div of container.children) {
        const txt = (div.textContent || '').toLowerCase();
        div.style.display = txt.includes(q) ? 'flex' : 'none';
    }
}, 120);

function abrirNovaConversaModal() {
    try { preencherSelectUsuariosPara(); } catch (_) { }
    document.getElementById('novaConversaModal')?.classList.remove('hidden');
}
function abrirConversaMobile() {
    if (window.innerWidth <= 768) {
        document.getElementById('chatTab').classList.add('chat-opened');
    }
}

function voltarParaLista() {
    document.getElementById('chatTab').classList.remove('chat-opened');
}

document.addEventListener('click', function (e) {
    // Se clicar em uma conversa no mobile, abrir o painel
    if (window.innerWidth <= 768) {
        // Procurar por qualquer elemento clicável dentro da lista de conversas
        const conversaItem = e.target.closest('#conversasList > *');
        if (conversaItem) {
            setTimeout(() => abrirConversaMobile(), 50);
        }
    }
});

(function () {
    const originalAbrirConversa = window.abrirConversa;
    if (typeof originalAbrirConversa === 'function') {
        window.abrirConversa = function (...args) {
            try {
                // chama a função original com os mesmos argumentos
                originalAbrirConversa.apply(this, args);
            } catch (e) {
                console.error('Erro ao chamar abrirConversa original:', e);
            }
            // se for mobile, abre painel (função auxiliar que você já tem)
            if (window.innerWidth <= 768) {
                try { abrirConversaMobile(); } catch (_) { /* noop */ }
            }
        };
    } else {
        // fallback seguro caso a função original não exista
        window.abrirConversa = function (id) {
            console.warn('abrirConversa não estava definida originalmente. id:', id);
            if (window.innerWidth <= 768) {
                try { abrirConversaMobile(); } catch (_) { /* noop */ }
            }
        };
    }
})();

window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
        document.getElementById('chatTab').classList.remove('chat-opened');
    }
});

async function solicitarAdm() {
    const admin = (usuarios || []).find(u => u.tipo === 'admin');
    if (!admin) {
        if (typeof mostrarToast === 'function') mostrarToast('Nenhum administrador encontrado', 'error');
        return;
    }

    const me = usuarioLogado.usuario;
    const chatId = gerarChatId(me, admin.usuario);

    // Verifica se já existe
    let chat = chatsList.find(c => c.id === chatId);
    if (!chat) {
        const novoChat = {
            id: chatId,
            membros: [me, admin.usuario],
            ultimoTexto: 'Iniciando conversa com ADM...',
            ultimoTimestamp: Date.now(),
            lidos: {}
        };

        try {
            await fetch(`${FIREBASE_URL}/chats/${chatId}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novoChat)
            });
            chatsList.unshift(novoChat);
        } catch (e) {
            console.error('Erro ao criar chat com ADM', e);
            if (typeof mostrarToast === 'function') mostrarToast('Erro ao criar conversa com ADM', 'error');
            return;
        }
    }

    // Abre o chat com o admin
    showTab('chatTab');
    if (typeof inicializarChat === 'function') inicializarChat();
    abrirConversa(chatId);
}
const fragment = document.createDocumentFragment();

function carregarMinhasOSFuncionario() {
    const container = document.getElementById('listaMinhasOSFuncionario');
    container.innerHTML = '';
    container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 p-2 sm:p-4';

    const minhas = ordensServico.filter(os =>
        os.solicitante === usuarioLogado.nome || os.criadoPor === usuarioLogado.nome
    );

    // Atualizar contadores no header
    const total = minhas.length;
    const concluidas = minhas.filter(os => os.status === 'concluida').length;
    const pendentes = minhas.filter(os => os.status === 'pendente').length;

    // Atualizar elementos do DOM
    const totalElement = document.getElementById('totalMinhasOS');
    const concluidasElement = document.getElementById('concluidasMinhasOS');
    const pendentesElement = document.getElementById('pendentesMinhasOS');

    if (totalElement) totalElement.textContent = total;
    if (concluidasElement) concluidasElement.textContent = concluidas;
    if (pendentesElement) pendentesElement.textContent = pendentes;

    if (minhas.length === 0) {
        container.className = 'flex flex-col items-center justify-center py-8 sm:py-16 px-4';
        container.innerHTML = `
            <div class="w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mb-3 sm:mb-4 shadow-lg">
                <svg class="w-8 h-8 sm:w-12 sm:h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
            </div>
            <p class="text-gray-600 text-base sm:text-lg font-semibold text-center">Você ainda não criou nenhuma OS</p>
            <p class="text-gray-400 text-xs sm:text-sm mt-1 text-center">Suas ordens de serviço aparecerão aqui</p>
        `;
        return;
    }

    // Ordenar as OS por ID numérico (1, 2, 3, 4, 5...)
    minhas.sort((a, b) => {
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idA - idB;
    });

    minhas.forEach(os => {
        // Formatação da data melhorada
        let dataFormatada = 'Não informada';
        if (os.dataAbertura) {
            const d = new Date(os.dataAbertura);
            if (!isNaN(d.getTime())) {
                dataFormatada =
                    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
                    ' às ' +
                    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            }
        }

        // Sistema de badges melhorado para status
        let statusConfig = {
            class: 'bg-yellow-50 text-yellow-700 border-yellow-200',
            icon: '⏳',
            text: 'Em Análise'
        };

        switch (os.status) {
            case 'concluida':
                statusConfig = {
                    class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    icon: '✅',
                    text: 'Concluída'
                };
                break;
            case 'pendente':
                statusConfig = {
                    class: 'bg-red-50 text-red-700 border-red-200',
                    icon: '⏸️',
                    text: 'Pendente'
                };
                break;
            case 'andamento':
                statusConfig = {
                    class: 'bg-blue-50 text-blue-700 border-blue-200',
                    icon: '🔄',
                    text: 'Em Andamento'
                };
                break;
        }

        // Sistema de badges melhorado para prioridade
        let prioridadeConfig = {
            class: 'bg-gray-50 text-gray-600 border-gray-200',
            icon: '📋',
            text: 'Não definida'
        };

        switch (os.prioridade) {
            case 'urgente':
                prioridadeConfig = {
                    class: 'bg-purple-50 text-purple-700 border-purple-200',
                    icon: '🚨',
                    text: 'Urgente'
                };
                break;
            case 'alta':
                prioridadeConfig = {
                    class: 'bg-red-50 text-red-700 border-red-200',
                    icon: '🔴',
                    text: 'Alta'
                };
                break;
            case 'media':
                prioridadeConfig = {
                    class: 'bg-amber-50 text-amber-700 border-amber-200',
                    icon: '🟡',
                    text: 'Média'
                };
                break;
            case 'baixa':
                prioridadeConfig = {
                    class: 'bg-green-50 text-green-700 border-green-200',
                    icon: '🟢',
                    text: 'Baixa'
                };
                break;
        }

        // Criação do card com design melhorado para mobile
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-gray-100 h-fit touch-manipulation';

        card.innerHTML = `
            <!-- Header com gradiente personalizado -->
            <div class="relative overflow-hidden" style="background: linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb);">
                <div class="absolute inset-0 bg-white opacity-10"></div>
                <div class="relative z-10 p-3 sm:p-4 text-white">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1 min-w-0">
                            <h3 class="font-bold text-base sm:text-lg mb-1">#${os.id}</h3>
                            <p class="text-blue-100 text-xs font-medium truncate pr-2">
                                ${os.equipamento || 'Sem equipamento'}
                            </p>
                        </div>
                        <span class="px-2 py-1 text-xs rounded-full font-medium border backdrop-blur-sm bg-white bg-opacity-90 ${statusConfig.class} ml-2 flex-shrink-0 whitespace-nowrap">
                            ${statusConfig.icon} ${statusConfig.text}
                        </span>
                    </div>
                </div>
                <!-- Elementos decorativos -->
                <div class="absolute -right-4 -top-4 sm:-right-6 sm:-top-6 w-12 h-12 sm:w-16 sm:h-16 bg-white opacity-5 rounded-full"></div>
                <div class="absolute -right-1 -bottom-1 sm:-right-2 sm:-bottom-2 w-8 h-8 sm:w-10 sm:h-10 bg-white opacity-5 rounded-full"></div>
            </div>

            <!-- Conteúdo principal -->
            <div class="p-3 sm:p-4 space-y-3">
                <!-- Informações organizadas verticalmente -->
                <div class="space-y-2 sm:space-y-3">
                    <!-- Setor -->
                    <div class="flex items-center space-x-2 sm:space-x-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                        <div class="w-5 h-5 sm:w-6 sm:h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <span class="text-white text-xs">🏢</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-blue-600 text-xs font-medium">Setor</p>
                            <p class="text-gray-800 font-semibold text-sm truncate">${os.setor || 'Não informado'}</p>
                        </div>
                    </div>
                    
                    <!-- Data -->
                    <div class="flex items-center space-x-2 sm:space-x-3 p-2 bg-green-50 rounded-lg border border-green-100">
                        <div class="w-5 h-5 sm:w-6 sm:h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <span class="text-white text-xs">📅</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-green-600 text-xs font-medium">Abertura</p>
                            <p class="text-gray-800 font-semibold text-xs break-words">${dataFormatada}</p>
                        </div>
                    </div>
                    
                    <!-- Técnico -->
                    <div class="flex items-center space-x-2 sm:space-x-3 p-2 bg-purple-50 rounded-lg border border-purple-100">
                        <div class="w-5 h-5 sm:w-6 sm:h-6 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <span class="text-white text-xs">👨‍🔧</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-purple-600 text-xs font-medium">Técnico</p>
                            <p class="text-gray-800 font-semibold text-sm truncate">${os.tecnicoNome || 'Não atribuído'}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Prioridade centralizada -->
                <div class="flex justify-center">
                    <span class="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold border ${prioridadeConfig.class} whitespace-nowrap">
                        ${prioridadeConfig.icon} Prioridade ${prioridadeConfig.text}
                    </span>
                </div>
                
                <!-- Descrição compacta -->
                <div class="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                    <p class="text-xs font-semibold text-gray-700 mb-1">Descrição</p>
                    <p class="text-xs text-gray-600 leading-relaxed line-clamp-3 break-words">
                        ${os.descricao ? os.descricao.substring(0, 100) + (os.descricao.length > 100 ? '...' : '') : 'Sem descrição disponível'}
                    </p>
                </div>

                <!-- Botões de Ação (apenas para OS não concluídas) -->
                ${os.status !== 'concluida' ? `
                <div class="flex gap-2 pt-2">
                    <button onclick="editarOSMinhas(${os.id})" class="flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-xs sm:text-sm font-medium py-2 px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 touch-manipulation min-h-[40px]">
                        <svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        <span class="hidden sm:inline">Editar</span>
                    </button>
                    <button onclick="excluirOSMinhas(${os.id})" class="flex-1 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-xs sm:text-sm font-medium py-2 px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 touch-manipulation min-h-[40px]">
                        <svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        <span class="hidden sm:inline">Apagar</span>
                    </button>
                </div>
                ` : ''}
            </div>
        `;

        container.appendChild(card);
    });
}

// Função para editar OS
function editarOSMinhas(id) {
    console.log('Tentando editar OS:', id);
    console.log('Array ordensServico:', ordensServico);
    
    // Buscar a OS no array
    const os = ordensServico.find(o => {
        console.log('Comparando:', o.id, 'com', id, 'tipos:', typeof o.id, typeof id);
        return o.id == id || String(o.id) === String(id);
    });
    
    if (!os) {
        console.error('OS não encontrada no array');
        alert('Ordem de serviço não encontrada!');
        return;
    }
    
    console.log('OS encontrada:', os);
    
    // Tentar usar a função existente
    if (typeof window.editarOSModal === 'function') {
        console.log('Chamando editarOSModal');
        window.editarOSModal(id);
    } else if (typeof editarOSModal === 'function') {
        console.log('Chamando editarOSModal global');
        editarOSModal(id);
    } else {
        console.log('Função editarOSModal não encontrada, criando modal simples');
        // Criar um modal simples se não existir
        criarModalEdicaoSimples(os);
    }
}

// Função para criar modal simples se não existir
function criarModalEdicaoSimples(os) {
    const novoSolicitante = prompt('Solicitante:', os.solicitante || '');
    if (novoSolicitante === null) return; // Cancelou
    
    const novoSetor = prompt('Setor:', os.setor || '');
    if (novoSetor === null) return;
    
    const novoEquipamento = prompt('Equipamento:', os.equipamento || '');
    if (novoEquipamento === null) return;
    
    const novaDescricao = prompt('Descrição:', os.descricao || '');
    if (novaDescricao === null) return;
    
    // Atualizar a OS
    os.solicitante = novoSolicitante;
    os.setor = novoSetor;
    os.equipamento = novoEquipamento;
    os.descricao = novaDescricao;
    
    // Salvar
    salvarDados();
    carregarMinhasOSFuncionario();
    
    if (typeof mostrarToast === 'function') {
        mostrarToast(`OS #${os.id} atualizada com sucesso!`);
    } else {
        alert(`OS #${os.id} atualizada com sucesso!`);
    }
}

// Função para excluir OS (usando exatamente o mesmo padrão da sua cancelarOS)
async function excluirOSMinhas(id) {
    console.log('Tentando excluir OS:', id);
    console.log('Array ordensServico:', ordensServico);
    
    if (!confirm(`Tem certeza que deseja excluir a OS #${id}?\n\nEsta ação não pode ser desfeita.`)) return;

    // Buscar a OS no array com comparação flexível
    const index = ordensServico.findIndex(o => {
        console.log('Comparando para exclusão:', o.id, 'com', id, 'tipos:', typeof o.id, typeof id);
        return o.id == id || String(o.id) === String(id);
    });
    
    if (index === -1) {
        console.error('OS não encontrada no array para exclusão');
        alert('Ordem de serviço não encontrada!');
        return;
    }

    console.log('OS encontrada no índice:', index);

    // Remove do array
    ordensServico.splice(index, 1);
    console.log('OS removida do array');

    // PERSISTIR: usar a função central de salvar (vai para Firebase quando online)
    await salvarDados();
    console.log('Dados salvos');

    // atualizar UI
    if (typeof carregarListaOS === 'function') carregarListaOS();
    if (typeof carregarMinhasOS === 'function') carregarMinhasOS();
    if (typeof atualizarDashboard === 'function') atualizarDashboard();
    
    // Recarregar esta lista específica
    carregarMinhasOSFuncionario();
    
    if (typeof mostrarToast === 'function') {
        mostrarToast(`OS #${id} excluída com sucesso!`);
    } else {
        alert(`OS #${id} excluída com sucesso!`);
    }
}

let notas = [];

const gradientesCategoria = {
    manutencao: 'linear-gradient(135deg, #0a1f44, #1e3a8a, #2563eb)',
    trabalho: 'linear-gradient(135deg, #064e3b, #059669, #10b981)',
    lembrete: 'linear-gradient(135deg, #92400e, #d97706, #f59e0b)',
    urgente: 'linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444)'
};

const iconesCategoria = {
    manutencao: '🔧',
    trabalho: '💼',
    lembrete: '📝',
    urgente: '🚨'
};

const nomesCategoria = {
    manutencao: 'Manutenção',
    trabalho: 'Trabalho Extra',
    lembrete: 'Lembrete',
    urgente: 'Urgente'
};

const iconesPrioridade = {
    alta: '🔴',
    media: '🟡',
    baixa: '🟢'
};

function carregarNotas() {
    const lista = document.getElementById('listaNotas');
    if (!lista) return;

    lista.innerHTML = '';

    const minhasNotas = notas.filter(n => n.usuario === usuarioLogado.usuario);
    const notasFiltradas = filtrarNotas(minhasNotas);

    // Atualizar contador
    const contador = document.getElementById('contadorFiltrado');
    if (contador) contador.textContent = notasFiltradas.length;

    if (notasFiltradas.length === 0) {
        lista.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="text-6xl mb-4">📝</div>
                <h3 class="font-bold text-gray-600 mb-2">Nenhuma nota encontrada</h3>
                <p class="text-sm text-gray-500">Crie sua primeira anotação</p>
            </div>
        `;
        return;
    }

    notasFiltradas.forEach(nota => {
        const card = criarCardNota(nota);
        lista.appendChild(card);
    });

    atualizarContadores();
    atualizarEstatisticas(minhasNotas);
}

function criarCardNota(nota) {
    const div = document.createElement('div');
    div.className = 'bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 transform transition-all duration-200 hover:scale-105 hover:shadow-lg';

    const gradient = gradientesCategoria[nota.categoria] || gradientesCategoria.lembrete;
    const iconeCategoria = iconesCategoria[nota.categoria] || '📝';
    const nomeCategoria = nomesCategoria[nota.categoria] || 'Lembrete';
    const iconePrioridade = iconesPrioridade[nota.prioridade] || '🟡';

    div.innerHTML = `
        <div class="p-4 text-white" style="background: ${gradient}">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center">
                    <span class="text-lg mr-2">${iconeCategoria}</span>
                    <div>
                        <div class="font-bold text-sm">${nomeCategoria}</div>
                        <div class="text-xs opacity-75">${new Date(nota.data).toLocaleDateString('pt-BR')}</div>
                    </div>
                </div>
                <div class="text-lg">${iconePrioridade}</div>
            </div>
            ${nota.equipamento ? `<div class="text-xs opacity-90 mb-1">🔧 ${nota.equipamento}</div>` : ''}
            ${nota.local ? `<div class="text-xs opacity-75">📍 ${nota.local}</div>` : ''}
        </div>
        
        <div class="p-4">
            <div class="text-sm text-gray-800 mb-3 leading-relaxed nota-texto cursor-pointer hover:bg-gray-50 rounded p-2 transition-all" onclick="editarNota(${nota.id})">
                ${nota.texto.length > 80 ? nota.texto.substring(0, 80) + '...' : nota.texto}
            </div>
            
            <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
                ${nota.tempo ? `<span class="flex items-center bg-blue-100 text-blue-700 px-2 py-1 rounded-full"><i class="fas fa-clock mr-1"></i>${nota.tempo}</span>` : '<span></span>'}
                <span class="bg-gray-100 px-2 py-1 rounded-full">${new Date(nota.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            
            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex space-x-1">
                    ${nota.categoria === 'trabalho' ? '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Extra</span>' : ''}
                </div>
                <div class="flex space-x-1">
                    <button onclick="editarNota(${nota.id})" class="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg text-xs transition-all">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="excluirNota(${nota.id})" class="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-xs transition-all">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    return div;
}

function atualizarEstatisticas(notas) {
    const hoje = new Date().toDateString();
    const notasHoje = notas.filter(n => new Date(n.data).toDateString() === hoje).length;
    const notasUrgentes = notas.filter(n => n.prioridade === 'alta' || n.categoria === 'urgente').length;

    const notasHojeEl = document.getElementById('notasHoje');
    const notasUrgentesEl = document.getElementById('notasUrgentes');

    if (notasHojeEl) notasHojeEl.textContent = notasHoje;
    if (notasUrgentesEl) notasUrgentesEl.textContent = notasUrgentes;
}

function filtrarNotas(notas) {
    const busca = document.getElementById('buscaNotas')?.value.toLowerCase() || '';
    const categoria = document.getElementById('filtroCategoria')?.value || '';
    const prioridade = document.getElementById('filtroPrioridade')?.value || '';

    return notas.filter(nota => {
        const matchBusca = !busca ||
            nota.texto.toLowerCase().includes(busca) ||
            (nota.equipamento && nota.equipamento.toLowerCase().includes(busca)) ||
            (nota.local && nota.local.toLowerCase().includes(busca));

        const matchCategoria = !categoria || nota.categoria === categoria;
        const matchPrioridade = !prioridade || nota.prioridade === prioridade;

        return matchBusca && matchCategoria && matchPrioridade;
    });
}

function atualizarContadores() {
    const minhasNotas = notas.filter(n => n.usuario === usuarioLogado.usuario);
    const trabalhos = minhasNotas.filter(n => n.categoria === 'trabalho');

    const totalNotasEl = document.getElementById('totalNotas');
    const totalTrabalhosEl = document.getElementById('totalTrabalhos');

    if (totalNotasEl) totalNotasEl.textContent = minhasNotas.length;
    if (totalTrabalhosEl) totalTrabalhosEl.textContent = trabalhos.length;
}


function editarNota(id) {
    const nota = notas.find(n => n.id === id);
    if (!nota) return;

    const novoTexto = prompt('Editar nota:', nota.texto);
    if (novoTexto !== null && novoTexto.trim() !== '') {
        nota.texto = novoTexto.trim();
        salvarDados();
        carregarNotas();
        mostrarToast('Nota atualizada!');
    }
}

function excluirNota(id) {
    if (confirm('Excluir esta nota?')) {
        notas = notas.filter(n => n.id !== id);
        salvarDados();
        carregarNotas();
        mostrarToast('Nota excluída!');
    }
}

function processarTempo() {
    const horas = parseInt(document.getElementById('notaTempoHoras').value) || 0;
    const minutos = parseInt(document.getElementById('notaTempoMinutos').value) || 0;
    const rapido = document.getElementById('notaTempoRapido').value;

    if (rapido) return rapido;
    if (horas === 0 && minutos === 0) return '';

    let tempo = '';
    if (horas > 0) tempo += `${horas}h`;
    if (minutos > 0) tempo += `${minutos}min`;

    return tempo;
}

document.addEventListener('DOMContentLoaded', function () {
    const formNota = document.getElementById('formNota');
    if (formNota) {
        formNota.addEventListener('submit', function (e) {
            e.preventDefault();

            const texto = document.getElementById('notaTexto').value.trim();
            const categoria = document.getElementById('notaCategoria').value;
            const prioridade = document.getElementById('notaPrioridade').value;
            const local = document.getElementById('notaLocal').value.trim();
            const equipamento = document.getElementById('notaEquipamento').value.trim();
            const tempo = processarTempo();

            if (!texto || !categoria) {
                mostrarToast('Preencha os campos obrigatórios!', 'error');
                return;
            }

            const novaNota = {
                id: Date.now(),
                usuario: usuarioLogado.usuario,
                texto,
                categoria,
                prioridade,
                local,
                equipamento,
                tempo,
                data: new Date().toISOString()
            };

            notas.push(novaNota);
            salvarDados();

            formNota.reset();
            document.getElementById('notaPrioridade').value = 'media';

            carregarNotas();
            mostrarToast('Nota salva com sucesso!');
        });
    }

    const tempoRapido = document.getElementById('notaTempoRapido');
    if (tempoRapido) {
        tempoRapido.addEventListener('change', function () {
            if (this.value) {
                document.getElementById('notaTempoHoras').value = '';
                document.getElementById('notaTempoMinutos').value = '';
            }
        });
    }

    const tempoHoras = document.getElementById('notaTempoHoras');
    const tempoMinutos = document.getElementById('notaTempoMinutos');

    if (tempoHoras) {
        tempoHoras.addEventListener('input', function () {
            if (this.value) document.getElementById('notaTempoRapido').value = '';
        });
    }

    if (tempoMinutos) {
        tempoMinutos.addEventListener('input', function () {
            if (this.value) document.getElementById('notaTempoRapido').value = '';
        });
    }

    const buscaNotas = document.getElementById('buscaNotas');
    const filtroCategoria = document.getElementById('filtroCategoria');
    const filtroPrioridade = document.getElementById('filtroPrioridade');

    if (buscaNotas) buscaNotas.addEventListener('input', carregarNotas);
    if (filtroCategoria) filtroCategoria.addEventListener('change', carregarNotas);
    if (filtroPrioridade) filtroPrioridade.addEventListener('change', carregarNotas);
});
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("input").forEach(input => {
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
    });
});
async function arquivarMes() {
    try {
        if (!ordensServico || ordensServico.length === 0) {
            mostrarToast("Nenhuma OS encontrada para arquivar!", "error");
            return;
        }

        // Pega o menor e o maior mês dentro das OS registradas
        const datasOS = ordensServico
            .map(os => new Date(os.dataAbertura || os.data || os.criadaEm))
            .filter(d => !isNaN(d));

        let periodo = "";
        if (datasOS.length > 0) {
            const minData = new Date(Math.min(...datasOS));
            const maxData = new Date(Math.max(...datasOS));
            if (minData.getMonth() === maxData.getMonth() && minData.getFullYear() === maxData.getFullYear()) {
                // Mesmo mês
                periodo = `${String(minData.getMonth() + 1).padStart(2, "0")}-${minData.getFullYear()}`;
            } else {
                // Vários meses diferentes
                periodo = `${String(minData.getMonth() + 1).padStart(2, "0")}-${minData.getFullYear()}_a_${String(maxData.getMonth() + 1).padStart(2, "0")}-${maxData.getFullYear()}`;
            }
        } else {
            // fallback para o mês atual
            const agora = new Date();
            periodo = `${String(agora.getMonth() + 1).padStart(2, "0")}-${agora.getFullYear()}`;
        }

        // Dados para backup
        const dadosBackup = {
            periodo,
            geradoEm: new Date().toISOString(),
            ordensServico,
            tecnicos,
            notas
        };

        // Gerar download do JSON
        const blob = new Blob([JSON.stringify(dadosBackup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup_OS_${periodo}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Limpar dados mensais (mantém técnicos e usuários)
        ordensServico = [];
        notas = [];
        proximoId = 1;


        await salvarDados();
        mostrarToast(`Mês (${periodo}) arquivado e dados limpos!`, "success");

    } catch (error) {
        console.error("Erro ao arquivar mês:", error);
        mostrarToast("Erro ao arquivar mês!", "error");
    }
}
// === MODAL OS RÁPIDA ===

// Abre o modal de OS rápida
function abrirModalOSRapida() {
    if (!usuarioLogado) {
        mostrarToast('Você precisa estar logado!', 'error');
        return;
    }

    const modal = document.getElementById('modalOSRapida');
    modal.classList.remove('hidden');

    // Aguarda o modal renderizar antes de preencher os campos
    setTimeout(() => {
        const inputSolicitante = document.getElementById('solicitanteRapida');
        const selectTecnico = document.getElementById('tecnicoRapida');

        if (inputSolicitante) inputSolicitante.value = usuarioLogado.nome || '';

        // Chama sua função real que carrega os técnicos
        carregarTecnicos(selectTecnico);
    }, 200);
}

// Fecha o modal
function fecharModalOSRapida() {
    const modal = document.getElementById('modalOSRapida');
    modal.classList.add('hidden');
    document.getElementById('osFormRapida').reset();
}

// Submete OS rápida
document.getElementById('osFormRapida').addEventListener('submit', function (e) {
    e.preventDefault();

    const tecnicoSelect = document.getElementById('tecnicoRapida');
    const novaOS = {
        id: proximoId++,
        solicitante: document.getElementById('solicitanteRapida').value,
         setor: this.querySelector('#setor').value,
        equipamento: document.getElementById('equipamentoRapido').value, // ✅ corrigido
        localizacao: '', // removido do modal
        tipoServico: '', // removido do modal
        tecnicoId: parseInt(tecnicoSelect.value),
        tecnicoNome: tecnicoSelect.selectedOptions[0]?.textContent || null,
        prioridade: 'media',
        descricao: document.getElementById('descricaoRapida').value, // ✅ corrigido
        materiais: '',
        observacoes: '',
        contatoSolicitante: '',
        numeroSerie: '',
        status: 'pendente',
        dataAbertura: new Date().toISOString(),
        criadoPor: usuarioLogado.nome
    };

    ordensServico.push(novaOS);
    salvarDados();
    mostrarToast(`OS #${novaOS.id} criada com sucesso!`, 'success');
    fecharModalOSRapida();

    // Atualiza telas conforme o tipo de usuário
    if (usuarioLogado.tipo === 'admin') {
        atualizarDashboard();
        atualizarGraficos();
    } else if (usuarioLogado.tipo === 'mecanico') {
        carregarMinhasOS();
    }
});