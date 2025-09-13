const fs = require('fs');
const path = require('path');

/* ===== Equivalente à struct PGM do código C ===== */
// struct PGM {
//  int w, h, maxv; // maxv = 255
//  unsigned char* data; // w*h bytes (tons de cinza)
// };
class PGM {
    constructor(width = 0, height = 0, maxValue = 255, data = null) {
        this.w = width;        // int w - largura da imagem
        this.h = height;       // int h - altura da imagem  
        this.maxv = maxValue;  // int maxv - valor máximo (255)
        this.data = data || Buffer.alloc(width * height); // unsigned char* data - dados dos pixels
    }

    /**
     * Calcula o tamanho total dos dados da imagem (w*h bytes)
     */
    getDataSize() {
        return this.w * this.h;
    }
}

/* ===== Equivalente à struct Header do código C ===== */
// struct Header {
//  int w, h, maxv; // metadados da imagem
//  int mode; // 0=NEGATIVO, 1=SLICE
//  int t1, t2; // válido se mode=SLICE
// };
class Header {
    constructor() {
        this.w = 0;        // int w - largura da imagem
        this.h = 0;        // int h - altura da imagem
        this.maxv = 255;   // int maxv - valor máximo de intensidade
        this.mode = 0;     // int mode - 0=NEGATIVO, 1=SLICE
        this.t1 = 0;       // int t1 - limite inferior (válido se mode=SLICE)
        this.t2 = 0;       // int t2 - limite superior (válido se mode=SLICE)
    }

    /**
     * Serializa o cabeçalho para Buffer
     */
    toBuffer() {
        const buffer = Buffer.alloc(24); // 6 inteiros de 4 bytes cada
        buffer.writeInt32LE(this.w, 0);
        buffer.writeInt32LE(this.h, 4);
        buffer.writeInt32LE(this.maxv, 8);
        buffer.writeInt32LE(this.mode, 12);
        buffer.writeInt32LE(this.t1, 16);
        buffer.writeInt32LE(this.t2, 20);
        return buffer;
    }

    /**
     * Deserializa o cabeçalho de um Buffer
     */
    fromBuffer(buffer) {
        this.w = buffer.readInt32LE(0);
        this.h = buffer.readInt32LE(4);
        this.maxv = buffer.readInt32LE(8);
        this.mode = buffer.readInt32LE(12);
        this.t1 = buffer.readInt32LE(16);
        this.t2 = buffer.readInt32LE(20);
    }
}

/* ===== Equivalente à struct Task do código C ===== */
// struct Task {
//  int row_start; // linha inicial (inclusiva)
//  int row_end; // linha final (exclusiva)
// };
class Task {
    constructor(rowStart = 0, rowEnd = 0) {
        this.row_start = rowStart; // int row_start - linha inicial (inclusiva)
        this.row_end = rowEnd;     // int row_end - linha final (exclusiva)
    }
}

/* ===== Constantes de modo - equivalente às #define do código C ===== */
// #define MODE_NEG 0
// #define MODE_SLICE 1
const MODE_NEG = 0;   // Modo filtro negativo
const MODE_SLICE = 1; // Modo limiarização com fatiamento

/* ===== Equivalente à função int read_pgm(const char* path, PGM* img) do código C ===== */
function readPGM(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        
        // Converte início para string para ler cabeçalho
        const headerStr = data.toString('ascii', 0, Math.min(200, data.length));
        const lines = headerStr.split('\n');
        
        let lineIndex = 0;
        let headerSize = 0;
        
        // Verifica P5
        if (lines[0].trim() !== 'P5') {
            throw new Error('Formato PGM inválido - deve ser P5');
        }
        headerSize += lines[0].length + 1; // +1 para o \n
        lineIndex++;
        
        // Pula comentários
        while (lineIndex < lines.length && lines[lineIndex].startsWith('#')) {
            headerSize += lines[lineIndex].length + 1;
            lineIndex++;
        }
        
        // Lê dimensões
        const dimensions = lines[lineIndex].trim().split(/\s+/);
        const width = parseInt(dimensions[0]);
        const height = parseInt(dimensions[1]);
        
        if (isNaN(width) || isNaN(height)) {
            throw new Error('Dimensões inválidas');
        }
        
        headerSize += lines[lineIndex].length + 1;
        lineIndex++;
        
        // Lê valor máximo
        const maxValue = parseInt(lines[lineIndex].trim());
        if (isNaN(maxValue)) {
            throw new Error('Valor máximo inválido');
        }
        
        headerSize += lines[lineIndex].length + 1;
        
        // Lê dados da imagem
        const imageData = data.slice(headerSize, headerSize + width * height);
        
        if (imageData.length !== width * height) {
            throw new Error(`Dados da imagem incompletos: esperado ${width * height}, obtido ${imageData.length}`);
        }

        const pgm = new PGM(width, height, maxValue, imageData);
        console.log(`PGM carregado: ${width}x${height}, max=${maxValue}, dados=${imageData.length} bytes`);
        
        return pgm;
    } catch (error) {
        console.error(`Erro ao ler arquivo PGM ${filePath}:`, error.message);
        throw error;
    }
}

/* ===== Equivalente à função int write_pgm(const char* path, const PGM* img) do código C ===== */
function writePGM(filePath, pgm) {
    try {
        const header = `P5\n${pgm.w} ${pgm.h}\n${pgm.maxv}\n`;
        const headerBuffer = Buffer.from(header, 'ascii');
        const fullBuffer = Buffer.concat([headerBuffer, pgm.data]);
        
        fs.writeFileSync(filePath, fullBuffer);
        console.log(`PGM salvo: ${filePath} (${pgm.w}x${pgm.h})`);
        
        return true;
    } catch (error) {
        console.error(`Erro ao escrever arquivo PGM ${filePath}:`, error.message);
        throw error;
    }
}

module.exports = {
    PGM,
    Header,
    Task,
    MODE_NEG,
    MODE_SLICE,
    readPGM,
    writePGM
};
