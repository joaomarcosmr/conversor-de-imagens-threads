# Sistema de Processamento de Imagens PGM com Paralelismo

Este projeto implementa um sistema de processamento de imagens PGM (Portable Gray Map) utilizando **processos independentes** que se comunicam através de **FIFO nomeado** e **processamento paralelo** com worker threads. O sistema demonstra conceitos fundamentais de **IPC (Inter-Process Communication)**, **paralelismo**, **sincronização** e **processamento de imagens**.

## 🎯 Objetivos

- Demonstrar comunicação entre processos independentes via FIFO
- Implementar processamento paralelo de imagens com worker threads  
- Aplicar filtros de imagem (negativo e limiarização com fatiamento)
- Utilizar mecanismos de sincronização (mutex e semáforos)
- Evidenciar ganhos de performance com paralelismo

## 🏗️ Arquitetura

O sistema é composto por **dois processos independentes**:

### 1. **Processo Emissor (Sender)**
- Carrega imagem PGM (formato P5) do disco
- Empacota metadados (largura, altura, valor máximo)
- Transmite dados via FIFO nomeado

### 2. **Processo Trabalhador (Worker)**
- Recebe dados da imagem via FIFO
- Cria pool de worker threads
- Distribui processamento em tarefas paralelas
- Aplica filtros de imagem com sincronização
- Salva resultado processado em disco

## 🔧 Filtros Implementados

### **Filtro Negativo**
- Transformação linear simples: `out = 255 - in`
- Inverte os tons de cinza da imagem

### **Limiarização com Fatiamento**
- Mantém valores dentro da faixa `[t1, t2]`
- Suprime valores fora da faixa (define como 0)
- Permite destacar regiões específicas de intensidade

## 🚀 Instalação e Uso

### **Pré-requisitos**
- Node.js >= 14.0.0
- Sistema operacional Unix/Linux (para FIFO nativo) ou Windows (usando arquivos temporários)

### **Instalação**
```bash
git clone <repositorio>
cd threads
npm install
```

### **Uso Básico**

#### **1. Executar Demonstração Completa**
```bash
# Linux/Mac
npm run demo

# Windows
run-demo.bat
# ou
npm run demo
```

#### **2. Uso Manual dos Processos**

**Terminal 1 - Iniciar Worker:**
```bash
# Linux/Mac - Filtro negativo com 4 threads
node src/worker.js /tmp/imgpipe output.pgm negativo 4

# Windows - Filtro negativo com 4 threads
node src/worker.js C:\temp\imgpipe output.pgm negativo 4

# Filtro slice (faixa 50-200) com 8 threads  
node src/worker.js /tmp/imgpipe output.pgm slice 50 200 8
```

**Terminal 2 - Enviar Imagem:**
```bash
# Linux/Mac
node src/sender.js /tmp/imgpipe input.pgm

# Windows
node src/sender.js C:\temp\imgpipe input.pgm
```

### **Parâmetros**

#### **Worker (Processo Trabalhador)**
```bash
node src/worker.js <fifo_path> <saida.pgm> <modo> [parâmetros] [nthreads]
```

**Modos disponíveis:**
- `negativo [nthreads]` - Aplica filtro negativo
- `slice t1 t2 [nthreads]` - Aplica limiarização (t1 e t2 são os limites da faixa)

#### **Sender (Processo Emissor)**
```bash
node src/sender.js <fifo_path> <entrada.pgm>
```

### **Exemplos de Uso**

```bash
# Exemplo 1: Filtro negativo com 4 threads
node src/worker.js /tmp/imgpipe negative_output.pgm negativo 4 &
node src/sender.js /tmp/imgpipe input.pgm

# Exemplo 2: Filtro slice (destacar tons entre 100-200) com 8 threads
node src/worker.js /tmp/imgpipe slice_output.pgm slice 100 200 8 &
node src/sender.js /tmp/imgpipe input.pgm

# Exemplo 3: Teste de performance com 1 thread
node src/worker.js /tmp/imgpipe perf_1t.pgm negativo 1 &
node src/sender.js /tmp/imgpipe large_image.pgm
```

## 📁 Estrutura do Projeto

```
threads/
├── src/
│   ├── pgm-utils.js      # Utilitários para manipulação PGM
│   ├── sender.js         # Processo emissor
│   ├── worker.js         # Processo trabalhador principal
│   ├── worker-thread.js  # Thread de processamento
│   ├── filters.js        # Implementação dos filtros
│   └── sync-utils.js     # Primitivas de sincronização
├── test/
│   ├── demo.js           # Demonstração completa
│   └── generate-test-images.js  # Gerador de imagens teste
├── images/               # Imagens de entrada (geradas automaticamente)
├── output/               # Imagens processadas
├── package.json
└── README.md
```

## 🔄 Fluxo de Execução

1. **Worker** abre FIFO para leitura (bloqueia)
2. **Sender** abre FIFO para escrita (conecta com worker)
3. **Sender** transmite cabeçalho + dados da imagem
4. **Worker** recebe dados e cria tarefas de processamento
5. **Worker** distribui tarefas entre threads do pool
6. **Threads** processam blocos de linhas em paralelo
7. **Worker** aguarda conclusão de todas as tarefas
8. **Worker** salva imagem processada no disco

## ⚙️ Sincronização

O sistema utiliza as seguintes primitivas de sincronização:

- **Mutex**: Protege acesso à fila de tarefas
- **Semáforos Contadores**: Coordenam produção/consumo de tarefas
- **Semáforo de Conclusão**: Sinaliza término do processamento
- **FIFO Nomeado**: Comunicação entre processos independentes

## 📊 Resultados Esperados

### **Funcionalidades Demonstradas**
✅ Transmissão de dados entre processos via FIFO  
✅ Aplicação correta dos filtros de imagem  
✅ Redução do tempo de processamento com paralelismo  
✅ Sincronização adequada sem condições de corrida  
✅ Escalabilidade com múltiplas threads  

### **Exemplo de Performance**
```
=== RESULTADOS DE PERFORMANCE ===
Threads | Tempo (ms) | Speedup
--------|------------|--------
      1 |       2450 |   1.00x
      2 |       1380 |   1.78x
      4 |        850 |   2.88x
      8 |        720 |   3.40x
```

## 🧪 Testes

### **Executar Todos os Testes**
```bash
npm run demo
```

### **Gerar Imagens de Teste**
```bash
node test/generate-test-images.js
```

O sistema gera automaticamente:
- `gradient.pgm` - Gradiente horizontal (256x256)
- `circles.pgm` - Círculos concêntricos (256x256)  
- `checkerboard.pgm` - Padrão xadrez (256x256)
- `large_test.pgm` - Imagem complexa para performance (1024x1024)

## 🔍 Formato PGM

O sistema processa imagens no formato **PGM P5** (binário):
- **Cabeçalho**: `P5`, largura, altura, valor máximo
- **Dados**: Bytes sequenciais representando pixels em tons de cinza
- **Suporte**: Imagens de 8 bits (0-255)

Exemplo de cabeçalho PGM:
```
P5
256 256
255
<dados binários>
```

## 🐛 Solução de Problemas

### **Erro: "FIFO não encontrado"**
O sistema cria automaticamente o FIFO. Certifique-se de ter permissões de escrita no diretório `/tmp/`.

### **Erro: "Worker threads não suportadas"**
Verifique se está usando Node.js >= 14.0.0:
```bash
node --version
```

### **Processo trava aguardando conexão**
O worker deve ser iniciado **antes** do sender. O FIFO bloqueia até ambos os lados estarem conectados.

### **Imagem corrompida na saída**
Verifique se a imagem de entrada está no formato PGM P5 válido e não foi corrompida durante a transmissão.

## 🎓 Conceitos Demonstrados

Este projeto ilustra na prática:

- **Processos vs Threads**: Comunicação entre processos independentes
- **IPC**: Uso de FIFO nomeado para transmissão de dados  
- **Paralelismo**: Distribuição de carga entre múltiplas threads
- **Sincronização**: Mutex, semáforos e coordenação de tarefas
- **Processamento de Imagens**: Filtros pixel-independentes
- **Performance**: Medição e análise de speedup com paralelismo

## 📈 Extensões Possíveis

- Suporte a outros formatos de imagem (PPM, PBM)
- Filtros mais complexos (blur, edge detection)
- Balanceamento dinâmico de carga
- Processamento distribuído em rede
- Interface gráfica para visualização
- Métricas avançadas de performance

---

**Desenvolvido como demonstração prática de conceitos de Sistemas Operacionais e Processamento Paralelo**
#   c o n v e r s o r - d e - i m a g e n s - t h r e a d s  
 