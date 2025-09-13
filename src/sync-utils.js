/* ===== Equivalente ao pthread_mutex_t do código C ===== */
// pthread_mutex_t q_lock = MUTEX_INIT;
// Implementação de Mutex (exclusão mútua) usando Promise
class Mutex {
    constructor() {
        this._locked = false;
        this._waitQueue = [];
    }

    /**
     * Adquire o lock (bloqueia se já estiver locked)
     */
    async lock() {
        return new Promise((resolve) => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._waitQueue.push(resolve);
            }
        });
    }

    /**
     * Libera o lock
     */
    unlock() {
        if (!this._locked) {
            throw new Error('Tentativa de unlock em mutex não locked');
        }

        if (this._waitQueue.length > 0) {
            const nextResolve = this._waitQueue.shift();
            nextResolve();
        } else {
            this._locked = false;
        }
    }

    /**
     * Executa uma função com lock automático
     */
    async withLock(fn) {
        await this.lock();
        try {
            return await fn();
        } finally {
            this.unlock();
        }
    }

    /**
     * Verifica se está locked
     */
    isLocked() {
        return this._locked;
    }
}

/* ===== Equivalente ao sem_t do código C ===== */
// sem_t sem_items; // quantas tarefas disponíveis
// sem_t sem_space; // espaço livre na fila
// Implementação de Semáforo contador
class Semaphore {
    constructor(initialCount = 0) {
        this._count = initialCount;
        this._waitQueue = [];
    }

    /**
     * Aguarda (decrementa contador, bloqueia se count <= 0)
     */
    async wait() {
        return new Promise((resolve) => {
            if (this._count > 0) {
                this._count--;
                resolve();
            } else {
                this._waitQueue.push(resolve);
            }
        });
    }

    /**
     * Sinaliza (incrementa contador, libera um aguardando se houver)
     */
    signal() {
        if (this._waitQueue.length > 0) {
            const nextResolve = this._waitQueue.shift();
            nextResolve();
        } else {
            this._count++;
        }
    }

    /**
     * Retorna o valor atual do contador
     */
    getCount() {
        return this._count;
    }

    /**
     * Retorna o número de threads aguardando
     */
    getWaitingCount() {
        return this._waitQueue.length;
    }
}

/* ===== Equivalente à fila circular + sincronização do código C ===== */
// #define QMAX 128
// Task queue_buf[QMAX];
// int q_head = 0, q_tail = 0, q_count = 0;
// pthread_mutex_t q_lock = MUTEX_INIT;
// sem_t sem_items; // quantas tarefas disponíveis
// sem_t sem_space; // espaço livre na fila
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

    /**
     * Adiciona uma tarefa à fila (bloqueia se fila cheia)
     */
    async enqueue(task) {
        // Aguarda espaço disponível
        await this.semSpace.wait();
        
        // Acesso exclusivo à fila
        await this.mutex.withLock(() => {
            this.buffer[this.tail] = task;
            this.tail = (this.tail + 1) % this.maxSize;
            this.count++;
        });
        
        // Sinaliza que há uma nova tarefa disponível
        this.semItems.signal();
    }

    /**
     * Remove uma tarefa da fila (bloqueia se fila vazia)
     */
    async dequeue() {
        // Aguarda tarefa disponível
        await this.semItems.wait();
        
        let task;
        // Acesso exclusivo à fila
        await this.mutex.withLock(() => {
            task = this.buffer[this.head];
            this.buffer[this.head] = null; // Limpa referência
            this.head = (this.head + 1) % this.maxSize;
            this.count--;
        });
        
        // Sinaliza que há espaço disponível
        this.semSpace.signal();
        
        return task;
    }

    /**
     * Retorna o número atual de tarefas na fila
     */
    async getSize() {
        return await this.mutex.withLock(() => this.count);
    }

    /**
     * Verifica se a fila está vazia
     */
    async isEmpty() {
        return await this.mutex.withLock(() => this.count === 0);
    }

    /**
     * Verifica se a fila está cheia
     */
    async isFull() {
        return await this.mutex.withLock(() => this.count === this.maxSize);
    }
}

/* ===== Equivalente à sinalização de término do código C ===== */
// pthread_mutex_t done_lock = MUTEX_INIT;
// sem_t sem_done; // sinaliza quando todas as tarefas finalizam
// int remaining_tasks = 0;
class CompletionCoordinator {
    constructor(totalTasks = 0) {
        this.mutex = new Mutex();           // pthread_mutex_t done_lock
        this.semDone = new Semaphore(0);    // sem_t sem_done
        this.remainingTasks = totalTasks;   // int remaining_tasks
        this.completed = false;
    }

    /**
     * Define o número total de tarefas
     */
    async setTotalTasks(total) {
        await this.mutex.withLock(() => {
            this.remainingTasks = total;
            this.completed = false;
        });
    }

    /**
     * Marca uma tarefa como concluída
     */
    async taskCompleted() {
        await this.mutex.withLock(() => {
            this.remainingTasks--;
            if (this.remainingTasks <= 0 && !this.completed) {
                this.completed = true;
                this.semDone.signal();
            }
        });
    }

    /**
     * Aguarda todas as tarefas serem concluídas
     */
    async waitForCompletion() {
        await this.semDone.wait();
    }

    /**
     * Retorna o número de tarefas restantes
     */
    async getRemainingTasks() {
        return await this.mutex.withLock(() => this.remainingTasks);
    }

    /**
     * Verifica se todas as tarefas foram concluídas
     */
    async isCompleted() {
        return await this.mutex.withLock(() => this.completed);
    }
}

module.exports = {
    Mutex,
    Semaphore,
    TaskQueue,
    CompletionCoordinator
};
