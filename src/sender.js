#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { readPGM, Header } = require('./pgm-utils');

/* ===== PROCESSO EMISSOR - Equivalente ao main_sender do código C ===== */
// int main_sender(int argc, char** argv) {
//  // argv: img_sender <fifo_path> <entrada.pgm>
//  // Emissor só envia a imagem; quem decide o filtro é o worker pelo CLI dele.
//  parse_args_or_exit();
//  const char* fifo = argv[1];
//  const char* inpath = argv[2];
//  // 1) Garante a existência do FIFO (mkfifo se necessário)
//  // 2) Lê a imagem PGM (P5) do disco
//  // 3) Prepara cabeçalho (mode/t1/t2 serão ignorados pelo worker;
//  // aqui enviamos apenas metadados da imagem)
//  // 4) Abre FIFO para escrita (bloqueia até worker abrir para leitura)
//  // 5) Envia cabeçalho + pixels
//  // 6) Fecha FIFO e libera memória
//  // 7) Fim
//  return 0;
// }

// ===== Equivalente ao parse_args_or_exit() do código C =====
function parseArgs() {
    const args = process.argv.slice(2); // argc, argv equivalente
    
    if (args.length < 2) {
        console.error('Uso: node sender.js <fifo_path> <entrada.pgm>');
        console.error('Exemplo: node sender.js /tmp/imgpipe input.pgm');
        process.exit(1);
    }

    return {
        fifoPath: args[0],  // const char* fifo = argv[1];
        inputPath: args[1]  // const char* inpath = argv[2];
    };
}

// ===== Passo 1) Garante a existência do FIFO (mkfifo se necessário) =====
function ensureFifo(fifoPath) {
    // No Windows, usamos named pipes ou arquivos temporários
    if (process.platform === 'win32') {
        // No Windows, não precisamos criar o FIFO antecipadamente
        // O sistema de arquivos será usado como alternativa
        console.log(`Sistema Windows detectado - usando arquivo temporário: ${fifoPath}`);
        return;
    }
    
    try {
        // Verifica se o FIFO já existe (sistemas Unix)
        const stats = fs.statSync(fifoPath);
        if (!stats.isFIFO()) {
            console.error(`Erro: ${fifoPath} existe mas não é um FIFO`);
            process.exit(1);
        }
        console.log(`FIFO ${fifoPath} já existe`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // FIFO não existe, cria um novo
            try {
                const { execSync } = require('child_process');
                execSync(`mkfifo "${fifoPath}"`);
                console.log(`FIFO criado: ${fifoPath}`);
            } catch (mkfifoError) {
                console.error(`Erro ao criar FIFO ${fifoPath}:`, mkfifoError.message);
                process.exit(1);
            }
        } else {
            console.error(`Erro ao verificar FIFO ${fifoPath}:`, error.message);
            process.exit(1);
        }
    }
}

// ===== Passos 4) e 5) Abre FIFO para escrita e envia cabeçalho + pixels =====
async function sendImageData(fifoPath, pgm) {
    return new Promise((resolve, reject) => {
        console.log(`Abrindo FIFO para escrita: ${fifoPath}`);
        console.log('Aguardando worker abrir FIFO para leitura...');
        
        // 4) Abre FIFO para escrita (bloqueia até worker abrir para leitura)
        const writeStream = fs.createWriteStream(fifoPath);
        
        writeStream.on('open', () => {
            console.log('FIFO aberto para escrita, enviando dados...');
            
            // 3) Prepara cabeçalho (mode/t1/t2 serão ignorados pelo worker;
            // aqui enviamos apenas metadados da imagem)
            const header = new Header();
            header.w = pgm.w;
            header.h = pgm.h;
            header.maxv = pgm.maxv;
            header.mode = 0; // Será ignorado pelo worker
            header.t1 = 0;   // Será ignorado pelo worker
            header.t2 = 0;   // Será ignorado pelo worker
            
            // 5) Envia cabeçalho + pixels
            const headerBuffer = header.toBuffer();
            writeStream.write(headerBuffer);
            
            console.log(`Cabeçalho enviado: ${pgm.w}x${pgm.h}, maxv=${pgm.maxv}`);
            
            // Envia dados dos pixels
            writeStream.write(pgm.data);
            
            console.log(`Dados da imagem enviados: ${pgm.data.length} bytes`);
            
            // 6) Fecha FIFO
            writeStream.end();
        });
        
        writeStream.on('finish', () => {
            console.log('Transmissão concluída com sucesso');
            resolve();
        });
        
        writeStream.on('error', (error) => {
            console.error('Erro na transmissão:', error.message);
            reject(error);
        });
    });
}

// ===== Função main equivalente ao main_sender do código C =====
async function main() {
    try {
        console.log('=== PROCESSO EMISSOR ===');
        
        // parse_args_or_exit();
        const { fifoPath, inputPath } = parseArgs();
        
        console.log(`FIFO: ${fifoPath}`);
        console.log(`Entrada: ${inputPath}`);
        
        // 1) Garante a existência do FIFO (mkfifo se necessário)
        ensureFifo(fifoPath);
        
        // 2) Lê a imagem PGM (P5) do disco
        console.log('Carregando imagem PGM...');
        const pgm = readPGM(inputPath);
        
        // 3), 4), 5), 6) Transmite via FIFO
        await sendImageData(fifoPath, pgm);
        
        // 7) Fim
        console.log('Processo emissor finalizado');
        // return 0; (equivalente)
        
    } catch (error) {
        console.error('Erro no processo emissor:', error.message);
        process.exit(1);
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };
