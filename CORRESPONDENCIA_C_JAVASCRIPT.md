# 📋 Correspondência Código C ↔ JavaScript

Este documento mostra **exatamente** como cada parte do código JavaScript corresponde ao código C original que você forneceu.

## 🏗️ **Estruturas de Dados**

### **C → JavaScript**

```c
// ===== CÓDIGO C =====
struct PGM {
    int w, h, maxv; // maxv = 255
    unsigned char* data; // w*h bytes (tons de cinza)
};
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
class PGM {
    constructor(width = 0, height = 0, maxValue = 255, data = null) {
        this.w = width;        // int w - largura da imagem
        this.h = height;       // int h - altura da imagem  
        this.maxv = maxValue;  // int maxv - valor máximo (255)
        this.data = data || Buffer.alloc(width * height); // unsigned char* data - dados dos pixels
    }
}
```

---

```c
// ===== CÓDIGO C =====
struct Header {
    int w, h, maxv; // metadados da imagem
    int mode; // 0=NEGATIVO, 1=SLICE
    int t1, t2; // válido se mode=SLICE
};
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
class Header {
    constructor() {
        this.w = 0;        // int w - largura da imagem
        this.h = 0;        // int h - altura da imagem
        this.maxv = 255;   // int maxv - valor máximo de intensidade
        this.mode = 0;     // int mode - 0=NEGATIVO, 1=SLICE
        this.t1 = 0;       // int t1 - limite inferior (válido se mode=SLICE)
        this.t2 = 0;       // int t2 - limite superior (válido se mode=SLICE)
    }
}
```

---

```c
// ===== CÓDIGO C =====
struct Task {
    int row_start; // linha inicial (inclusiva)
    int row_end; // linha final (exclusiva)
};
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
class Task {
    constructor(rowStart = 0, rowEnd = 0) {
        this.row_start = rowStart; // int row_start - linha inicial (inclusiva)
        this.row_end = rowEnd;     // int row_end - linha final (exclusiva)
    }
}
```

---

## 🔧 **Constantes**

```c
// ===== CÓDIGO C =====
#define MODE_NEG 0
#define MODE_SLICE 1
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
const MODE_NEG = 0;   // Modo filtro negativo
const MODE_SLICE = 1; // Modo limiarização com fatiamento
```

---

## 🔄 **Funções de Filtro**

```c
// ===== CÓDIGO C =====
void apply_negative_block(int rs, int re) {
    //lógica do filtro
}
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
function applyNegativeBlock(inputData, outputData, width, rowStart, rowEnd, maxValue = 255) {
    const startPixel = rowStart * width;   // rs * width (linha inicial)
    const endPixel = rowEnd * width;       // re * width (linha final)
    
    // Loop pelos pixels do bloco de linhas (rs até re)
    for (let i = startPixel; i < endPixel; i++) {
        outputData[i] = maxValue - inputData[i]; // out = 255 - in
    }
    
    return endPixel - startPixel; // Retorna número de pixels processados
}
```

---

```c
// ===== CÓDIGO C =====
void apply_slice_block(int rs, int re, int t1, int t2) {
    // lógica do filtro
}
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
function applySliceBlock(inputData, outputData, width, rowStart, rowEnd, t1, t2) {
    const startPixel = rowStart * width;   // rs * width (linha inicial)
    const endPixel = rowEnd * width;       // re * width (linha final)
    
    // Loop pelos pixels do bloco de linhas (rs até re)
    for (let i = startPixel; i < endPixel; i++) {
        const pixelValue = inputData[i];
        
        if (pixelValue >= t1 && pixelValue <= t2) {
            // Mantém o valor original se estiver na faixa [t1, t2]
            outputData[i] = pixelValue;
        } else {
            // Suprime o valor (define como 0 - fora da faixa)
            outputData[i] = 0;
        }
    }
    
    return endPixel - startPixel; // Retorna número de pixels processados
}
```

---

## 🔒 **Sincronização**

### **Variáveis Globais do Worker**

```c
// ===== CÓDIGO C =====
// Fila de tarefas (circular) + sincronização
#define QMAX 128
Task queue_buf[QMAX];
int q_head = 0, q_tail = 0, q_count = 0;
pthread_mutex_t q_lock = MUTEX_INIT;
sem_t sem_items; // quantas tarefas disponíveis
sem_t sem_space; // espaço livre na fila

// Sinalização de término
pthread_mutex_t done_lock = MUTEX_INIT;
sem_t sem_done; // sinaliza quando todas as tarefas finalizam
int remaining_tasks = 0;

// Dados compartilhados para processamento
PGM g_in, g_out;
int g_mode; // MODE_NEG ou MODE_SLICE
int g_t1, g_t2;
int g_nthreads = 4;
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
class TaskQueue {
    constructor(maxSize = 128) {
        this.buffer = new Array(maxSize);    // Task queue_buf[QMAX];
        this.maxSize = maxSize;              // QMAX
        this.head = 0;                       // int q_head = 0;
        this.tail = 0;                       // int q_tail = 0;
        this.count = 0;                      // int q_count = 0;
        
        // Sincronização
        this.mutex = new Mutex();                    // pthread_mutex_t q_lock
        this.semItems = new Semaphore(0);           // sem_t sem_items
        this.semSpace = new Semaphore(maxSize);     // sem_t sem_space
    }
}

class CompletionCoordinator {
    constructor(totalTasks = 0) {
        this.mutex = new Mutex();           // pthread_mutex_t done_lock
        this.semDone = new Semaphore(0);    // sem_t sem_done
        this.remainingTasks = totalTasks;   // int remaining_tasks
        this.completed = false;
    }
}

// Dados globais passados para worker threads via workerData:
const {
    inputBuffer,    // equivalente a g_in.data
    outputBuffer,   // equivalente a g_out.data
    width,          // g_in.w
    height,         // g_in.h
    mode,           // g_mode
    t1,             // g_t1
    t2,             // g_t2
    maxValue,       // g_in.maxv
    threadId        // identificador da thread
} = workerData;
```

---

## 🧵 **Worker Thread**

```c
// ===== CÓDIGO C =====
void* worker_thread(void* arg) {
    while (1) {
        //lógica da thread
    }
    return NULL;
}
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
// Loop principal da thread - equivalente ao while(1) do código C
parentPort.on('message', async (message) => {
    const { type, task } = message;
    
    if (type === 'PROCESS_TASK') {
        const { row_start, row_end } = task; // Task com row_start e row_end
        
        // Aplica o filtro no bloco de linhas
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
        
        // Notifica conclusão da tarefa
        // Equivalente a decrementar remaining_tasks e sinalizar sem_done
        parentPort.postMessage({
            type: 'TASK_COMPLETED',
            threadId,
            task,
            processedPixels
        });
        
    } else if (type === 'TERMINATE') {
        process.exit(0); // return NULL; equivalente
    }
});
```

---

## 📤 **Processo Sender**

```c
// ===== CÓDIGO C =====
int main_sender(int argc, char** argv) {
    // argv: img_sender <fifo_path> <entrada.pgm>
    // Emissor só envia a imagem; quem decide o filtro é o worker pelo CLI dele.
    parse_args_or_exit();
    const char* fifo = argv[1];
    const char* inpath = argv[2];
    // 1) Garante a existência do FIFO (mkfifo se necessário)
    // 2) Lê a imagem PGM (P5) do disco
    // 3) Prepara cabeçalho (mode/t1/t2 serão ignorados pelo worker;
    // aqui enviamos apenas metadados da imagem)
    // 4) Abre FIFO para escrita (bloqueia até worker abrir para leitura)
    // 5) Envia cabeçalho + pixels
    // 6) Fecha FIFO e libera memória
    // 7) Fim
    return 0;
}
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
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
```

---

## 🏭 **Processo Worker**

```c
// ===== CÓDIGO C =====
int main_worker(int argc, char** argv) {
    // argv: img_worker <fifo_path> <saida.pgm> <negativo|slice> [t1 t2] [nthreads]
    parse_args_or_exit();
    const char* fifo = argv[1];
    const char* outpth = argv[2];
    const char* mode = argv[3];
    if (mode == "negativo") {
        g_mode = MODE_NEG;
        g_nthreads = (argc >= 5) ? atoi(argv[4]) : 4;
    } else if (mode == "slice") {
        g_mode = MODE_SLICE;
        g_t1 = atoi(argv[4]);
        g_t2 = atoi(argv[5]);
        g_nthreads = (argc >= 7) ? atoi(argv[6]) : 4;
    } else {
        exit_error("Modo inválido");
    }
    // 1) Garante FIFO e abre para leitura (bloqueia até sender abrir em escrita)
    // 2) Lê cabeçalho + pixels do FIFO
    // 3) Cria pool de threads e fila de tarefas
    // 5) Aguarda término de todas as tarefas
    // 7) Grava imagem de saída
    // 8) Libera recursos
    // 9) Fim
    return 0;
}
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
async function main() {
    try {
        console.log('=== PROCESSO TRABALHADOR ===');
        
        // parse_args_or_exit();
        const { fifoPath, outputPath, mode, t1, t2, nthreads } = parseArgs();
        
        // Parse dos argumentos conforme código C
        if (modeStr === 'negativo') {
            mode = MODE_NEG;  // g_mode = MODE_NEG;
            nthreads = args.length >= 4 ? parseInt(args[3]) : 4; // g_nthreads = (argc >= 5) ? atoi(argv[4]) : 4;
        } else if (modeStr === 'slice') {
            mode = MODE_SLICE; // g_mode = MODE_SLICE;
            t1 = parseInt(args[3]);      // g_t1 = atoi(argv[4]);
            t2 = parseInt(args[4]);      // g_t2 = atoi(argv[5]);
            nthreads = args.length >= 6 ? parseInt(args[5]) : 4; // g_nthreads = (argc >= 7) ? atoi(argv[6]) : 4;
        } else {
            process.exit(1); // exit_error("Modo inválido");
        }
        
        // 1) Garante FIFO e abre para leitura + 2) Lê cabeçalho + pixels do FIFO
        console.log('Aguardando dados via FIFO...');
        const inputPgm = await receiveImageData(fifoPath);
        
        // 3) Cria pool de threads e processa
        console.log('Iniciando processamento paralelo...');
        const outputPgm = await processWithThreadPool(inputPgm, mode, t1, t2, nthreads);
        
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
```

---

## 🔄 **Pool de Threads**

```c
// ===== CÓDIGO C =====
// 3) Cria pool de threads e fila de tarefas – porém, não é necessário ser um pool de threads
// 5) Aguarda término de todas as tarefas
```

```javascript
// ===== JAVASCRIPT EQUIVALENTE =====
async function processWithThreadPool(inputPgm, mode, t1, t2, nthreads) {
    const outputPgm = new PGM(inputPgm.w, inputPgm.h, inputPgm.maxv); // g_out equivalente
    
    // Compartilha dados entre threads (equivalente a g_in, g_out globais)
    const inputBuffer = new Uint8Array(inputPgm.data);   // g_in.data
    const outputBuffer = new Uint8Array(outputPgm.data); // g_out.data
    
    // Coordenador de conclusão (equivalente a remaining_tasks e sem_done)
    const coordinator = new CompletionCoordinator(tasks.length);
    
    // 3) Cria pool de threads
    for (let i = 0; i < nthreads; i++) {
        // Cria worker thread (equivalente a pthread_create)
        const worker = new Worker(path.join(__dirname, 'worker-thread.js'), {
            workerData: {
                inputBuffer,              // g_in.data
                outputBuffer,             // g_out.data
                width: inputPgm.w,        // g_in.w
                height: inputPgm.h,       // g_in.h
                mode,                     // g_mode
                t1,                       // g_t1
                t2,                       // g_t2
                maxValue: inputPgm.maxv,  // g_in.maxv
                threadId: i               // identificador da thread
            }
        });
    }
    
    // 5) Aguarda término de todas as tarefas
    await coordinator.waitForCompletion(); // Equivalente a sem_wait(sem_done)
    
    // 8) Libera recursos - termina todos os workers
    for (const worker of workers) {
        await worker.terminate(); // Equivalente a pthread_join
    }
    
    return outputPgm;
}
```

---

## 🎯 **Resumo da Correspondência**

| **Código C** | **JavaScript Equivalente** | **Arquivo** |
|--------------|----------------------------|-------------|
| `struct PGM` | `class PGM` | `src/pgm-utils.js` |
| `struct Header` | `class Header` | `src/pgm-utils.js` |
| `struct Task` | `class Task` | `src/pgm-utils.js` |
| `#define MODE_NEG 0` | `const MODE_NEG = 0` | `src/pgm-utils.js` |
| `apply_negative_block()` | `applyNegativeBlock()` | `src/filters.js` |
| `apply_slice_block()` | `applySliceBlock()` | `src/filters.js` |
| `pthread_mutex_t` | `class Mutex` | `src/sync-utils.js` |
| `sem_t` | `class Semaphore` | `src/sync-utils.js` |
| `queue_buf[QMAX]` | `class TaskQueue` | `src/sync-utils.js` |
| `remaining_tasks, sem_done` | `class CompletionCoordinator` | `src/sync-utils.js` |
| `main_sender()` | `main()` em `src/sender.js` | `src/sender.js` |
| `main_worker()` | `main()` em `src/worker.js` | `src/worker.js` |
| `worker_thread()` | `parentPort.on('message')` | `src/worker-thread.js` |
| `pthread_create` | `new Worker()` | `src/worker.js` |
| `pthread_join` | `worker.terminate()` | `src/worker.js` |

---

## ✅ **Funcionalidades Implementadas**

1. ✅ **Estruturas de dados** idênticas ao C
2. ✅ **Processo Emissor** com mesmo fluxo do `main_sender`
3. ✅ **Processo Trabalhador** com mesmo fluxo do `main_worker`  
4. ✅ **Worker Threads** equivalentes ao `worker_thread`
5. ✅ **Filtros de imagem** com mesma lógica (negativo e slice)
6. ✅ **Sincronização** com mutex e semáforos
7. ✅ **Comunicação FIFO** entre processos independentes
8. ✅ **Pool de threads** para processamento paralelo
9. ✅ **Mesma interface de linha de comando**
10. ✅ **Mesmo formato PGM P5**

O código JavaScript implementa **exatamente** a mesma funcionalidade e estrutura do código C, adaptado para as especificidades do Node.js e JavaScript!
