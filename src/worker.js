#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { PGM, Header, Task, MODE_NEG, MODE_SLICE, writePGM } = require('./pgm-utils');
const { TaskQueue, CompletionCoordinator } = require('./sync-utils');
const { validateSliceParams } = require('./filters');

/* ===== PROCESSO TRABALHADOR - Equivalente ao main_worker do código C ===== */
// int main_worker(int argc, char** argv) {
//  // argv: img_worker <fifo_path> <saida.pgm> <negativo|slice> [t1 t2] [nthreads]
//  parse_args_or_exit();
//  // 1) Garante FIFO e abre para leitura (bloqueia até sender abrir em escrita)
//  // 2) Lê cabeçalho + pixels do FIFO
//  // 3) Cria pool de threads e fila de tarefas
//  // 5) Aguarda término de todas as tarefas
//  // 7) Grava imagem de saída
//  // 8) Libera recursos
//  // 9) Fim
//  return 0;
// }

// ===== Equivalente ao parse_args_or_exit() do código C =====
function parseArgs() {
    const args = process.argv.slice(2); // argc, argv equivalente
    
    if (args.length < 3) {
        console.error('Uso: node worker.js <fifo_path> <saida.pgm> <negativo|slice> [t1 t2] [nthreads]');
        console.error('Exemplos:');
        console.error('  node worker.js /tmp/imgpipe output_neg.pgm negativo [4]');
        console.error('  node worker.js /tmp/imgpipe output_slice.pgm slice 50 200 [4]');
        process.exit(1);
    }

    const fifoPath = args[0];   // argv[1]
    const outputPath = args[1]; // argv[2] 
    const modeStr = args[2];    // argv[3]
    
    let mode, t1 = 0, t2 = 255, nthreads = 4;
    
    // ===== Parse dos argumentos conforme código C =====
    if (modeStr === 'negativo') {
        mode = MODE_NEG;  // g_mode = MODE_NEG;
        nthreads = args.length >= 4 ? parseInt(args[3]) : 4; // g_nthreads = (argc >= 5) ? atoi(argv[4]) : 4;
    } else if (modeStr === 'slice') {
        mode = MODE_SLICE; // g_mode = MODE_SLICE;
        if (args.length < 5) {
            console.error('Modo slice requer parâmetros t1 e t2');
            process.exit(1);
        }
        t1 = parseInt(args[3]);      // g_t1 = atoi(argv[4]);
        t2 = parseInt(args[4]);      // g_t2 = atoi(argv[5]);
        nthreads = args.length >= 6 ? parseInt(args[5]) : 4; // g_nthreads = (argc >= 7) ? atoi(argv[6]) : 4;
        
        // Valida parâmetros do slice
        validateSliceParams(t1, t2);
    } else {
        console.error(`Modo inválido: ${modeStr}. Use 'negativo' ou 'slice'`);
        process.exit(1); // exit_error("Modo inválido");
    }
    
    if (nthreads < 1 || nthreads > 32) {
        console.error('Número de threads deve estar entre 1 e 32');
        process.exit(1);
    }
    
    return { fifoPath, outputPath, mode, t1, t2, nthreads };
}

// ===== Passo 1) e 2) Garante FIFO e lê cabeçalho + pixels do FIFO =====
async function receiveImageData(fifoPath) {
    return new Promise((resolve, reject) => {
        console.log(`Abrindo FIFO para leitura: ${fifoPath}`);
        console.log('Aguardando sender abrir FIFO para escrita...');
        
        // 1) Abre FIFO para leitura (bloqueia até sender abrir em escrita)
        const readStream = fs.createReadStream(fifoPath);
        const chunks = [];
        
        readStream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        readStream.on('end', () => {
            try {
                const fullBuffer = Buffer.concat(chunks);
                console.log(`Dados recebidos: ${fullBuffer.length} bytes`);
                
                // 2) Lê cabeçalho + pixels do FIFO
                // Lê cabeçalho (24 bytes)
                if (fullBuffer.length < 24) {
                    throw new Error('Dados insuficientes para cabeçalho');
                }
                
                const header = new Header();
                header.fromBuffer(fullBuffer.slice(0, 24));
                
                console.log(`Cabeçalho recebido: ${header.w}x${header.h}, maxv=${header.maxv}`);
                
                // Lê dados da imagem
                const expectedDataSize = header.w * header.h;
                const imageData = fullBuffer.slice(24, 24 + expectedDataSize);
                
                if (imageData.length !== expectedDataSize) {
                    throw new Error(`Dados da imagem incompletos: esperado ${expectedDataSize}, recebido ${imageData.length}`);
                }
                
                const pgm = new PGM(header.w, header.h, header.maxv, imageData);
                resolve(pgm);
                
            } catch (error) {
                reject(error);
            }
        });
        
        readStream.on('error', (error) => {
            reject(error);
        });
    });
}

function createTasks(height, nthreads) {
    const tasks = [];
    const linesPerThread = Math.ceil(height / nthreads);
    
    for (let i = 0; i < nthreads; i++) {
        const rowStart = i * linesPerThread;
        const rowEnd = Math.min((i + 1) * linesPerThread, height);
        
        if (rowStart < height) {
            tasks.push(new Task(rowStart, rowEnd));
        }
    }
    
    console.log(`Criadas ${tasks.length} tarefas (${linesPerThread} linhas por tarefa)`);
    return tasks;
}

// ===== Passo 3) Cria pool de threads e fila de tarefas =====
async function processWithThreadPool(inputPgm, mode, t1, t2, nthreads) {
    const outputPgm = new PGM(inputPgm.w, inputPgm.h, inputPgm.maxv);

    const inputBuffer = new Uint8Array(inputPgm.data);
    const sharedOutputBuffer = new SharedArrayBuffer(inputPgm.data.length);
    const outputBuffer = new Uint8Array(sharedOutputBuffer);

    const tasks = createTasks(inputPgm.h, nthreads);
    const coordinator = new CompletionCoordinator(tasks.length);

    console.log(`Iniciando ${nthreads} worker threads...`);

    // 3) Cria pool de threads
    const workers = [];

    for (let i = 0; i < nthreads; i++) {
        const worker = new Worker(path.join(__dirname, 'worker-thread.js'), {
            workerData: {
                inputBuffer,
                sharedOutputBuffer,
                width: inputPgm.w,
                height: inputPgm.h,
                mode,
                t1,
                t2,
                maxValue: inputPgm.maxv,
                threadId: i
            }
        });

        workers.push(worker);
    }

    // Array para promises das TAREFAS (não dos workers)
    const taskPromises = [];

    // Distribui tarefas para os workers
    console.log('Distribuindo tarefas...');
    for (let i = 0; i < tasks.length; i++) {
        const worker = workers[i % nthreads];

        // Promise para CADA TAREFA individual
        const taskPromise = new Promise((resolve, reject) => {
            let taskCompleted = false;

            // Listener específico para ESTA tarefa
            const messageListener = async (message) => {
                if (message.type === 'TASK_COMPLETED' && message.taskId === i) {
                    console.log(`Thread ${message.threadId} concluiu tarefa ${i} (${message.processedPixels} pixels)`);
                    await coordinator.taskCompleted();
                    taskCompleted = true;
                    worker.off('message', messageListener); // Remove listener
                    resolve();
                } else if (message.type === 'TASK_ERROR' && message.taskId === i) {
                    console.error(`Thread ${message.threadId} erro na tarefa ${i}: ${message.error}`);
                    worker.off('message', messageListener);
                    reject(new Error(message.error));
                }
            };

            worker.on('message', messageListener);

            worker.on('error', (error) => {
                if (!taskCompleted) {
                    reject(error);
                }
            });
        });

        taskPromises.push(taskPromise); // ← Adiciona promise da TAREFA

        // Envia tarefa com ID
        worker.postMessage({
            type: 'PROCESS_TASK',
            task: tasks[i],
            taskId: i  // ← Importante: ID da tarefa
        });
    }

    // 5)  Aguarda TODAS as promises das tarefas
    console.log('Aguardando conclusão das tarefas...');
    await Promise.all(taskPromises); // ← USA as promises coletadas!
    await coordinator.waitForCompletion();

    // 8) Libera recursos
    console.log('Terminando worker threads...');
    for (const worker of workers) {
        worker.postMessage({ type: 'TERMINATE' });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    for (const worker of workers) {
        await worker.terminate();
    }

    outputPgm.data = Buffer.from(outputBuffer);

    console.log('Processamento concluído');
    return outputPgm;
}

// ===== Função main equivalente ao main_worker do código C =====
async function main() {
    try {
        console.log('=== PROCESSO TRABALHADOR ===');
        
        // parse_args_or_exit();
        const { fifoPath, outputPath, mode, t1, t2, nthreads } = parseArgs();
        
        console.log(`FIFO: ${fifoPath}`);
        console.log(`Saída: ${outputPath}`);
        console.log(`Modo: ${mode === MODE_NEG ? 'negativo' : 'slice'}`);
        if (mode === MODE_SLICE) {
            console.log(`Parâmetros slice: t1=${t1}, t2=${t2}`);
        }
        console.log(`Threads: ${nthreads}`);
        
        // 1) Garante FIFO e abre para leitura + 2) Lê cabeçalho + pixels do FIFO
        console.log('Aguardando dados via FIFO...');
        const inputPgm = await receiveImageData(fifoPath);
        
        // 3) Cria pool de threads e processa
        console.log('Iniciando processamento paralelo...');
        const startTime = Date.now();
        
        const outputPgm = await processWithThreadPool(inputPgm, mode, t1, t2, nthreads);
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        console.log(`Tempo de processamento: ${processingTime}ms`);
        
        // 7) Grava imagem de saída
        console.log('Salvando imagem processada...');
        writePGM(outputPath, outputPgm);
        
        // 9) Fim
        console.log('Processo trabalhador finalizado com sucesso');
        // return 0; (equivalente)
        
    } catch (error) {
        console.error('Erro no processo trabalhador:', error.message);
        process.exit(1);
    }
}

// Executa se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { main };
