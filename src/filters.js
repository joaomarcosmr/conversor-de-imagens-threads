const { MODE_NEG, MODE_SLICE } = require('./pgm-utils');

/* ===== FILTRO NEGATIVO - BASE MATEMÁTICA ===== */
// Operação de negativo: s = T(r) = L - 1 - r = 255 - r
// onde r = pixel de entrada, L = máximo valor (256), s = pixel de saída
//
// Pseudo código:
// Loop 1 de 0 até tamanho x:
//   Loop 2 de 0 até tamanho y:
//     novo_pixel[x,y] = 255 – valor_pixel_original[x,y]
//
function applyNegativeBlock(inputData, outputData, width, rowStart, rowEnd, maxValue = 255) {
    const startPixel = rowStart * width;   // rs * width (linha inicial)
    const endPixel = rowEnd * width;       // re * width (linha final)
    
    // Implementação do pseudo código - Loop pelos pixels do bloco
    for (let i = startPixel; i < endPixel; i++) {
        const r = inputData[i];           // r = pixel de entrada
        const L = maxValue + 1;           // L = máximo valor representado (256)
        const s = L - 1 - r;             // s = T(r) = L - 1 - r = 255 - r
        outputData[i] = s;                // novo_pixel = 255 - valor_pixel_original
    }
    
    return endPixel - startPixel; // Retorna número de pixels processados
}

/* ===== FILTRO SLICE - BASE MATEMÁTICA ===== */
// Limiarização com fatiamento - destaca pixels fora da faixa [Limite_a, Limite_b]
//
// Pseudo código fornecido:
// Limite_a = 50
// Limite_b = 100
// Loop 1 de 0 até tamanho x:
//   Loop 2 de 0 até tamanho y:
//     Se valor_pixel_original[x,y] <= Limite_a OU valor_pixel_original[x,y] >= Limite_b
//       novo_pixel[x,y] = 255
//     Senão
//       novo_pixel[x,y] = valor_pixel_original[x,y]
//
function applySliceBlock(inputData, outputData, width, rowStart, rowEnd, limite_a, limite_b) {
    const startPixel = rowStart * width;   // rs * width (linha inicial)
    const endPixel = rowEnd * width;       // re * width (linha final)
    
    // Implementação do pseudo código - Loop pelos pixels do bloco
    for (let i = startPixel; i < endPixel; i++) {
        const valor_pixel_original = inputData[i];  // valor_pixel_original[x,y]
        
        // Se valor_pixel_original <= Limite_a OU valor_pixel_original >= Limite_b
        if (valor_pixel_original <= limite_a || valor_pixel_original >= limite_b) {
            outputData[i] = 255;                     // novo_pixel[x,y] = 255
        } else {
            outputData[i] = valor_pixel_original;    // novo_pixel[x,y] = valor_pixel_original[x,y]
        }
    }
    
    return endPixel - startPixel; // Retorna número de pixels processados
}

/**
 * Aplica filtro genérico baseado no modo especificado
 */
function applyFilter(inputData, outputData, width, rowStart, rowEnd, mode, t1 = 0, t2 = 255, maxValue = 255) {
    let processedPixels = 0;
    
    switch (mode) {
        case MODE_NEG:
            processedPixels = applyNegativeBlock(inputData, outputData, width, rowStart, rowEnd, maxValue);
            break;
            
        case MODE_SLICE:
            processedPixels = applySliceBlock(inputData, outputData, width, rowStart, rowEnd, t1, t2);
            break;
            
        default:
            throw new Error(`Modo de filtro inválido: ${mode}`);
    }
    
    return processedPixels;
}

/**
 * Valida parâmetros do filtro slice
 */
function validateSliceParams(t1, t2, maxValue = 255) {
    if (t1 < 0 || t1 > maxValue) {
        throw new Error(`t1 deve estar entre 0 e ${maxValue}, recebido: ${t1}`);
    }
    
    if (t2 < 0 || t2 > maxValue) {
        throw new Error(`t2 deve estar entre 0 e ${maxValue}, recebido: ${t2}`);
    }
    
    if (t1 > t2) {
        throw new Error(`t1 deve ser menor ou igual a t2, recebido: t1=${t1}, t2=${t2}`);
    }
    
    return true;
}

/**
 * Calcula estatísticas de processamento para debug
 */
function calculateStats(inputData, outputData, rowStart, rowEnd, width) {
    const startPixel = rowStart * width;
    const endPixel = rowEnd * width;
    
    let minIn = 255, maxIn = 0, avgIn = 0;
    let minOut = 255, maxOut = 0, avgOut = 0;
    
    for (let i = startPixel; i < endPixel; i++) {
        const inVal = inputData[i];
        const outVal = outputData[i];
        
        minIn = Math.min(minIn, inVal);
        maxIn = Math.max(maxIn, inVal);
        avgIn += inVal;
        
        minOut = Math.min(minOut, outVal);
        maxOut = Math.max(maxOut, outVal);
        avgOut += outVal;
    }
    
    const pixelCount = endPixel - startPixel;
    avgIn /= pixelCount;
    avgOut /= pixelCount;
    
    return {
        pixelCount,
        input: { min: minIn, max: maxIn, avg: Math.round(avgIn) },
        output: { min: minOut, max: maxOut, avg: Math.round(avgOut) }
    };
}

module.exports = {
    applyNegativeBlock,
    applySliceBlock,
    applyFilter,
    validateSliceParams,
    calculateStats
};
