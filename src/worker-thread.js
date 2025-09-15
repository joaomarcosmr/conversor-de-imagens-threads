const { parentPort, workerData } = require('worker_threads');
const { applyFilter } = require('./filters');

/* ===== Equivalente à função void* worker_thread(void* arg) do código C ===== */
// void* worker_thread(void* arg) {
//  while (1) {
//   //lógica da thread
//  }
//  return NULL;
// }
// Thread de trabalho para processamento de imagem
// Recebe tarefas via parentPort e processa blocos de linhas

// ===== Dados compartilhados equivalentes às variáveis globais do código C =====
// PGM g_in, g_out;
// int g_mode; // MODE_NEG ou MODE_SLICE
// int g_t1, g_t2;
const {
    inputBuffer,        // equivalente a g_in.data
    sharedOutputBuffer, // SharedArrayBuffer compartilhado
    width,              // g_in.w
    height,             // g_in.h
    mode,               // g_mode
    t1,                 // g_t1
    t2,                 // g_t2
    maxValue,           // g_in.maxv
    threadId            // identificador da thread
} = workerData;

// Cria view do SharedArrayBuffer para esta thread
const outputBuffer = new Uint8Array(sharedOutputBuffer);

console.log(`Worker ${threadId} iniciado`);

// ===== Loop principal da thread - equivalente ao while(1) do código C =====
// Escuta por tarefas do thread principal (substitui a fila de tarefas)
parentPort.on('message', async (message) => {
    const { type, task } = message;
    
    if (type === 'PROCESS_TASK') {
        try {
            const { row_start, row_end } = task; // Task com row_start e row_end
            
            console.log(`Worker ${threadId} processando linhas ${row_start}-${row_end}`);
            
            // ===== Aplica o filtro no bloco de linhas =====
            // Equivalente a chamar apply_negative_block() ou apply_slice_block()
            // baseado no g_mode
            const processedPixels = applyFilter(
                inputBuffer,    // g_in.data
                outputBuffer,   // g_out.data
                width,          // g_in.w
                row_start,      // rs
                row_end,        // re
                mode,           // g_mode
                t1,             // g_t1
                t2,             // g_t2
                maxValue        // g_in.maxv
            );
            
            console.log(`Worker ${threadId} processou ${processedPixels} pixels`);
            
            // ===== Notifica conclusão da tarefa =====
            // Equivalente a decrementar remaining_tasks e sinalizar sem_done
            parentPort.postMessage({
                type: 'TASK_COMPLETED',
                threadId,
                taskId: message.taskId,
                processedPixels: task.rowEnd - task.rowStart
            });
            
        } catch (error) {
            console.error(`Worker ${threadId} erro:`, error.message);
            parentPort.postMessage({
                type: 'TASK_ERROR',
                threadId,
                task,
                error: error.message
            });
        }
    } else if (type === 'TERMINATE') {
        console.log(`Worker ${threadId} terminando`);
        process.exit(0); // return NULL; equivalente
    }
});
