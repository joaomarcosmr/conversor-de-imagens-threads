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
    
    let minInput = 255, maxInput = 0, minOutput = 255, maxOutput = 0;
    
    // Implementação do pseudo código - Loop pelos pixels do bloco
    for (let i = startPixel; i < endPixel; i++) {
        const r = inputData[i];           // r = pixel de entrada
        const L = maxValue + 1;           // L = máximo valor representado (256)
        const s = L - 1 - r;             // s = T(r) = L - 1 - r = 255 - r
        outputData[i] = s;                // novo_pixel = 255 - valor_pixel_original
        
        // Estatísticas para debug
        minInput = Math.min(minInput, r);
        maxInput = Math.max(maxInput, r);
        minOutput = Math.min(minOutput, s);
        maxOutput = Math.max(maxOutput, s);
    }
    
    // Debug: log da primeira thread para ver estatísticas
    if (rowStart === 0) {
        console.log(`Debug negativo: input[${minInput}-${maxInput}] -> output[${minOutput}-${maxOutput}]`);
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
    
    // Conforme fórmula matemática: z' = 0 se z ≤ a ou z ≥ b, z' = k se a < z < b
    // onde k é um valor de destaque (usaremos 255 para máximo contraste)
    const k = 255; // valor para pixels dentro da faixa
    
    let pixelsInRange = 0;
    let pixelsOutRange = 0;
    
    // Implementação da fórmula matemática - Loop pelos pixels do bloco
    for (let i = startPixel; i < endPixel; i++) {
        const z = inputData[i];  // valor do pixel original (z)
        
        // z' = 0 se z ≤ a ou z ≥ b (pixels fora da faixa ficam pretos)
        if (z <= limite_a || z >= limite_b) {
            outputData[i] = 0;   // z' = 0
            pixelsOutRange++;
        } else {
            // z' = k se a < z < b (pixels dentro da faixa ficam com valor k)
            outputData[i] = k;   // z' = k
            pixelsInRange++;
        }
    }
    
    // Debug: log da primeira thread para ver estatísticas
    if (rowStart === 0) {
        console.log(`Debug slice: ${pixelsInRange} pixels na faixa [${limite_a+1}-${limite_b-1}], ${pixelsOutRange} pixels fora`);
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
