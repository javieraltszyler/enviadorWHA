// ========================================
// MENÚ PERSONALIZADO
// ========================================

/**
 * Crea el menú personalizado al abrir el sheet
 */

function verificarArchivo() {
  const hojaActiva = SpreadsheetApp.getActiveSpreadsheet();
  console.log('📄 Nombre del archivo:', hojaActiva.getName());
  console.log('📄 ID del archivo:', hojaActiva.getId());
}
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('📨 Envío WhatsApp')
    .addItem('🚀 PROCESAR LOTE', 'botonProcesar')
    .addSeparator()
    .addItem('⏸️ PAUSAR ENVÍOS', 'botonPausar')
    .addItem('▶️ INICIAR/REANUDAR ENVÍOS', 'botonReanudar')
    .addSeparator()
    .addItem('📊 VER ESTADO', 'mostrarEstado')
    .addItem('🔧 PROBAR CONFIG', 'probarConfiguracion')
    .addToUi();
}

// ========================================
// SISTEMA DE ENVÍO MASIVO DE WHATSAPP
// ========================================

// ========================================
// FUNCIONES PRINCIPALES
// ========================================

/**
 * Función principal que se ejecuta al hacer clic en PROCESAR
 * Toma TODOS los mensajes pendientes y los envía a procesar
 */
function procesarLote() {
  try {
    console.log('=== INICIANDO PROCESAMIENTO MANUAL DE LOTE ===');
    
    const config = getConfig();
    if (!config) {
      SpreadsheetApp.getUi().alert('❌ Error: No se pudo leer la configuración');
      return;
    }
    
    const pendientes = getPendientes();
    console.log(`Total de mensajes pendientes encontrados: ${pendientes.length}`);
    
    if (pendientes.length === 0) {
      SpreadsheetApp.getUi().alert('✅ No hay mensajes pendientes para procesar');
      return;
    }

    // TOMAR TODOS LOS MENSAJES PENDIENTES
    const loteActual = pendientes;
    console.log(`Procesando TODOS los ${loteActual.length} mensajes pendientes`);
    
    const nroLote = generarNroLote();
    console.log(`Preparando lote ${nroLote} con ${loteActual.length} mensajes`);
    
    // Crear registros en Estado_envios CON IDs ÚNICOS
    crearRegistrosEnvio(nroLote, loteActual, config);
    
    // Marcar como procesados en Lote_para_procesar
    marcarComoProcesados(loteActual);
    
    console.log(`✅ Preparación completada: ${loteActual.length} mensajes listos para trigger automático`);

    SpreadsheetApp.getUi().alert(`✅ Preparación completada\n\n${loteActual.length} mensajes listos en Estado_envios.\n\nEl trigger automático se encargará de procesarlos.`);

  } catch (error) {
    console.error('Error en procesarLote:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}

// ========================================
// FUNCIONES DE CONTROL
// ========================================

/**
 * Pausa los envíos automáticos y desinstala el trigger
 */
function pausarEnvios() {
  try {
    setConfigValue('envios_pausados', true);
    desinstalarTriggerAutomatico();
    SpreadsheetApp.getUi().alert('⏸️ Envíos pausados correctamente.\n\nEl trigger automático se detuvo.');
    console.log('Envíos pausados y trigger desinstalado');
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error al pausar: ${error.message}`);
  }
}

/**
 * Reanuda los envíos automáticos e instala el trigger
 */
function reanudarEnvios() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    const triggersExistentes = ScriptApp.getProjectTriggers().filter(
      trigger => trigger.getHandlerFunction() === 'procesarSiguienteLote'
    );
    
    let intervalo = 5;
    
    if (triggersExistentes.length === 0) {
      const response = ui.prompt(
        'Configurar Intervalo',
        'Ingrese cada cuántos minutos procesar automáticamente:',
        ui.ButtonSet.OK_CANCEL
      );
      
      if (response.getSelectedButton() === ui.Button.CANCEL) {
        return;
      }
      
      const intervaloDeseado = parseInt(response.getResponseText().trim());
      
      if (isNaN(intervaloDeseado) || intervaloDeseado < 1) {
        ui.alert('Error: Ingrese un número válido mayor a 0');
        return;
      }
      
      intervalo = encontrarIntervaloValido(intervaloDeseado);
      
      if (intervalo !== intervaloDeseado) {
        const confirmacion = ui.alert(
          'Ajuste de Intervalo',
          `Solicitaste ${intervaloDeseado} minutos.\n\nGoogle Apps Script solo permite: 1, 5, 10, 15 o 30 minutos.\n\n¿Usar ${intervalo} minutos (el más cercano)?`,
          ui.ButtonSet.YES_NO
        );
        
        if (confirmacion === ui.Button.NO) {
          return;
        }
      }
      
      instalarTriggerAutomaticoConIntervalo(intervalo);
    }
    
    setConfigValue('envios_pausados', false);
    SpreadsheetApp.getUi().alert(`▶️ Envíos iniciados/reanudados correctamente.\n\nTrigger automático activo cada ${intervalo} minutos.`);
    console.log('Envíos reanudados y trigger activo');
    
  } catch (error) {
    SpreadsheetApp.getUi().alert(`❌ Error al reanudar: ${error.message}`);
  }
}

/**
 * Obtiene el estado actual del proceso
 */
function getEstadoProceso() {
  try {
    const pausado = getConfigValue('envios_pausados');
    const mensajesEnCola = getMensajesEnCola();
    const jobsEnProceso = getJobsEnProceso().length;
    const pendientes = getPendientes().length;
    
    let estado;
    if (pausado) {
      estado = '⏸️ PAUSADO';
    } else if (jobsEnProceso > 0 || mensajesEnCola > 0) {
      estado = '🔄 PROCESANDO';
    } else if (pendientes > 0) {
      estado = '⏳ PENDIENTE';
    } else {
      estado = '✅ INACTIVO';
    }
    
    return {
      estado: estado,
      pendientes: pendientes,
      en_cola: mensajesEnCola,
      jobs_activos: jobsEnProceso
    };
    
  } catch (error) {
    console.error('Error en getEstadoProceso:', error);
    return { estado: '❌ ERROR', pendientes: 0, en_cola: 0, jobs_activos: 0 };
  }
}

// ========================================
// FUNCIONES DE DATOS
// ========================================

/**
 * Obtiene la configuración activa
 */
/**
 * Obtiene la configuración completa CON TODAS LAS INSTANCIAS
 */
/**
 * Obtiene la configuración completa CON TODAS LAS INSTANCIAS Y DEBUG
 */
function getConfig() {
  try {
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('config');
    const data = hoja.getDataRange().getValues();
    const headers = data[0];
    const fila1 = data[1];

    console.log('🧠 Encabezados encontrados:', JSON.stringify(headers));
    console.log('📊 Fila 2 completa (todos los valores):', JSON.stringify(fila1));

    // Buscar índices de columnas
    const idxMin = headers.indexOf('wait_min_segundos');
    const idxMax = headers.indexOf('wait_max_segundos');
    const idxLote = headers.indexOf('cantidad_por_lote');
    const idxWebhook = headers.indexOf('webhook_n8n');
    const idxInstancia = headers.indexOf('instancia');
    const idxUrlCompleta = headers.indexOf('url_completa');
    const idxToken = headers.indexOf('token');
    const idxNumeroRemitente = headers.indexOf('numero_remitente');
    const idxActiva = headers.indexOf('activa');
    const idxEnviosPausados = headers.indexOf('envios_pausados');

    console.log('📍 Índices de columnas encontrados:');
    console.log(`   - wait_min_segundos está en índice: ${idxMin}`);
    console.log(`   - wait_max_segundos está en índice: ${idxMax}`);
    console.log(`   - cantidad_por_lote está en índice: ${idxLote}`);
    console.log(`   - webhook_n8n está en índice: ${idxWebhook}`);

    console.log('📊 Valores RAW leídos de la fila 2:');
    console.log(`   - wait_min_segundos (índice ${idxMin}): "${fila1[idxMin]}" (tipo: ${typeof fila1[idxMin]})`);
    console.log(`   - wait_max_segundos (índice ${idxMax}): "${fila1[idxMax]}" (tipo: ${typeof fila1[idxMax]})`);
    console.log(`   - cantidad_por_lote (índice ${idxLote}): "${fila1[idxLote]}" (tipo: ${typeof fila1[idxLote]})`);
    console.log(`   - webhook_n8n (índice ${idxWebhook}): "${fila1[idxWebhook]}"`);

    // Validación básica
    if (idxMin === -1 || idxMax === -1 || idxLote === -1) {
      throw new Error('Faltan columnas básicas en config: wait_min_segundos, wait_max_segundos, cantidad_por_lote');
    }

    // Configuración general CON CONVERSIÓN EXPLÍCITA
    const waitMinRaw = fila1[idxMin];
    const waitMaxRaw = fila1[idxMax];
    const cantidadLoteRaw = fila1[idxLote];

    const configGeneral = {
      wait_min_segundos: parseInt(waitMinRaw) || 40,
      wait_max_segundos: parseInt(waitMaxRaw) || 90,
      cantidad_por_lote: parseInt(cantidadLoteRaw) || 5,
      envios_pausados: Boolean(fila1[idxEnviosPausados]),
      webhook_n8n: fila1[idxWebhook] || 'https://altchat.app.n8n.cloud/webhook/enviar-whatsapp'
    };

    console.log('🔧 Config procesada:');
    console.log(`   - wait_min_segundos: RAW="${waitMinRaw}" → PROCESADO=${configGeneral.wait_min_segundos} (${typeof configGeneral.wait_min_segundos})`);
    console.log(`   - wait_max_segundos: RAW="${waitMaxRaw}" → PROCESADO=${configGeneral.wait_max_segundos} (${typeof configGeneral.wait_max_segundos})`);
    console.log(`   - cantidad_por_lote: RAW="${cantidadLoteRaw}" → PROCESADO=${configGeneral.cantidad_por_lote} (${typeof configGeneral.cantidad_por_lote})`);
    console.log(`   - envios_pausados: ${configGeneral.envios_pausados}`);

    // Construir array de instancias
    const instancias = [];
    let instanciaActiva = null;

    console.log('📱 Procesando instancias...');
    
    for (let i = 1; i < data.length; i++) {
      const fila = data[i];
      const instancia = fila[idxInstancia];
      
      if (instancia && instancia.toString().trim() !== '') {
        const instanciaObj = {
          instancia: instancia.toString().trim(),
          url_completa: fila[idxUrlCompleta] ? fila[idxUrlCompleta].toString().trim() : '',
          token: fila[idxToken] ? fila[idxToken].toString().trim() : '',
          numero_remitente: fila[idxNumeroRemitente] ? fila[idxNumeroRemitente].toString() : '',
          activa: Boolean(fila[idxActiva])
        };

        instancias.push(instanciaObj);

        if (instanciaObj.activa && !instanciaActiva) {
          instanciaActiva = instanciaObj.instancia;
        }

        console.log(`   ✓ Instancia ${i}: ${instanciaObj.instancia} (activa: ${instanciaObj.activa})`);
      }
    }

    // Configuración final
    const configCompleta = {
      ...configGeneral,
      instancias: instancias,
      instancia_activa: instanciaActiva
    };

    console.log('✅ Config final construida:');
    console.log(`   - Total instancias: ${configCompleta.instancias.length}`);
    console.log(`   - Instancia activa: ${configCompleta.instancia_activa}`);
    console.log('📄 Config completa:', JSON.stringify(configCompleta, null, 2));

    return configCompleta;

  } catch (error) {
    console.error('❌ Error en getConfig:', error);
    return null;
  }
}
/**
 * Obtiene un valor específico de la configuración
 */
function getConfigValue(campo) {
  const config = getConfig();
  return config ? config[campo] : null;
}

/**
 * Establece un valor en la configuración
 */
function setConfigValue(campo, valor) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('config');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIndex = headers.indexOf(campo);
    
    if (colIndex === -1) {
      throw new Error(`Campo ${campo} no encontrado en config`);
    }
    
    sheet.getRange(2, colIndex + 1).setValue(valor);
    
  } catch (error) {
    console.error('Error en setConfigValue:', error);
    throw error;
  }
}

/**
 * Obtiene mensajes pendientes de procesamiento
 */
function getPendientes() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lote_para_procesar');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const pendientes = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const procesado = row[headers.indexOf('procesado')];
      
      if (!procesado && row[headers.indexOf('telefono')]) {
        pendientes.push({
          fila: i + 1,
          telefono: row[headers.indexOf('telefono')],
          msj: row[headers.indexOf('msj')],
          imagen: row[headers.indexOf('imagen')]
        });
      }
    }
    
    return pendientes;
    
  } catch (error) {
    console.error('Error en getPendientes:', error);
    return [];
  }
}

/**
 * Obtiene la cantidad de mensajes en cola o procesando
 */
function getMensajesEnCola() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const estadoIndex = headers.indexOf('Estado');
    
    let contador = 0;
    for (let i = 1; i < data.length; i++) {
      const estado = data[i][estadoIndex];
      if (estado === 'en_cola' || estado === 'procesando') {
        contador++;
      }
    }
    
    return contador;
    
  } catch (error) {
    console.error('Error en getMensajesEnCola:', error);
    return 0;
  }
}

/**
 * Obtiene jobs que están en proceso
 */
function getJobsEnProceso() {
  try {
    console.log('🔍 Verificando estado de jobs...');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      console.log('✅ Tabla Jobs vacía - continuar');
      return [];
    }
    
    const headers = data[0];
    const estadoIndex = headers.indexOf('estado');
    const nroJobIndex = headers.indexOf('nro_job');
    const totalMensajesIndex = headers.indexOf('total_mensajes');
    
    const jobsEnProceso = [];
    
    for (let i = 1; i < data.length; i++) {
      const estado = data[i][estadoIndex];
      
      // CONDICIÓN ESPECÍFICA: en_cola O procesando
      if (estado === 'en_cola' || estado === 'procesando') {
        const job = {
          nro_job: data[i][nroJobIndex],
          estado: estado,
          total_mensajes: data[i][totalMensajesIndex]
        };
        jobsEnProceso.push(job);
        console.log(`🚨 Job activo encontrado: ${job.nro_job} (estado: ${job.estado})`);
      }
    }
    
    if (jobsEnProceso.length === 0) {
      console.log('✅ Ningún job en estado en_cola o procesando');
    } else {
      console.log(`⏸️ ${jobsEnProceso.length} jobs activos detectados - BLOQUEAR TRIGGER`);
    }
    
    return jobsEnProceso;
    
  } catch (error) {
    console.error('❌ Error verificando jobs:', error);
    return []; // En caso de error, permitir continuar
  }
}

// ========================================
// FUNCIONES DE ESCRITURA CON ID ÚNICO
// ========================================

/**
 * Genera ID único para cada mensaje
 */
/**
 * Genera ID único para cada mensaje (COMO TEXTO)
 */
function generarIdUnico() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `ID${timestamp}${random}`;  // ← AGREGAR PREFIJO "ID"
}

/**
 * Crea registros en Estado_envios CON ID ÚNICO
 * Estructura: A=id, B=timestamp_en_cola, C=nro_lote, D=numero_destinatario, E=Mensaje, F=imagen_url, G=Estado, H=timestamp_job, I=nro_job...
 */
function crearRegistrosEnvio(nroLote, mensajes, config) {
  console.log(`Creando ${mensajes.length} registros en Estado_envios con IDs únicos...`);
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
  const timestamp = new Date();

  const filas = mensajes.map((mensaje, index) => {
    const idUnico = generarIdUnico();
    console.log(`Creando registro ${index + 1}/${mensajes.length}: ID=${idUnico}, Tel=${mensaje.telefono}`);
    
    return [
      idUnico,                    // A: id
      timestamp,                  // B: timestamp_en_cola
      nroLote,                   // C: nro_lote
      mensaje.telefono,          // D: numero_destinatario
      mensaje.msj,               // E: Mensaje
      mensaje.imagen || '',      // F: imagen_url
      'en_cola',                 // G: Estado
      '',                        // H: timestamp_job
      '',                        // I: nro_job
      '',                        // J: timestamp_envio
      '',                        // K: Instancia
      '',                        // L: numero_remitente
      ''                         // M: rta_api
    ];
  });

  if (filas.length > 0) {
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, filas[0].length);
    range.setValues(filas);
    console.log(`✅ ${filas.length} registros creados en Estado_envios con IDs únicos`);
  }
}

/**
 * Marca mensajes como procesados
 */
function marcarComoProcesados(mensajes) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Lote_para_procesar');
    
    mensajes.forEach(mensaje => {
      sheet.getRange(mensaje.fila, 4).setValue(true);
    });
    
    console.log(`${mensajes.length} mensajes marcados como procesados`);
    
  } catch (error) {
    console.error('Error en marcarComoProcesados:', error);
    throw error;
  }
}

/**
 * Actualiza nro_job y timestamp_job usando IDs únicos
 */
function actualizarNroJobEnEstadoEnviosPorId(idsUnicos, nuevoNroJob) {
  try {
    console.log(`🔄 Actualizando nro_job a ${nuevoNroJob} para ${idsUnicos.length} mensajes por ID único...`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idIndex = headers.indexOf('id');
    const timestampJobIndex = headers.indexOf('timestamp_job');
    const nroJobIndex = headers.indexOf('nro_job');
    
    if (idIndex === -1) {
      throw new Error('Columna "id" no encontrada');
    }
    
    const timestampJob = obtenerTimestampDelJob(nuevoNroJob);
    let actualizados = 0;
    
    const idsSet = new Set(idsUnicos);
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const idUnico = row[idIndex];
      
      if (idsSet.has(idUnico)) {
        sheet.getRange(i + 1, timestampJobIndex + 1).setValue(timestampJob);
        sheet.getRange(i + 1, nroJobIndex + 1).setValue(nuevoNroJob);
        
        actualizados++;
        console.log(`   ✓ ID ${idUnico}: actualizado con job ${nuevoNroJob}`);
        
        idsSet.delete(idUnico);
        if (idsSet.size === 0) break;
      }
    }
    
    console.log(`✅ ${actualizados} mensajes actualizados con nro_job: ${nuevoNroJob}`);
    
  } catch (error) {
    console.error('Error en actualizarNroJobEnEstadoEnviosPorId:', error);
    throw error;
  }
}

/**
 * Obtiene el timestamp_iniciado del job desde la tabla Jobs
 */
function obtenerTimestampDelJob(nroJob) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const nroJobIndex = headers.indexOf('nro_job');
    const timestampIniciadoIndex = headers.indexOf('timestamp_iniciado');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[nroJobIndex] === nroJob) {
        return row[timestampIniciadoIndex] || new Date();
      }
    }
    
    return new Date();
    
  } catch (error) {
    console.error('Error obteniendo timestamp del job:', error);
    return new Date();
  }
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

/**
 * Genera un número de lote único
 */
function generarNroLote() {
  return Date.now().toString();
}

// ========================================
// FUNCIONES DE INTERFAZ (BOTONES)
// ========================================

function botonProcesar() { procesarLote(); }
function botonPausar() { pausarEnvios(); }
function botonReanudar() { reanudarEnvios(); }

function mostrarEstado() {
  const estado = getEstadoProceso();
  SpreadsheetApp.getUi().alert(`Estado: ${estado.estado}\nPendientes: ${estado.pendientes}\nEn cola: ${estado.en_cola}\nJobs activos: ${estado.jobs_activos}`);
  console.log('Estado actual:', estado);
}

function probarConfiguracion() {
  try {
    console.log('=== PROBANDO CONFIGURACIÓN ===');
    
    const config = getConfig();
    console.log('Config:', config);
    
    const pendientes = getPendientes();
    console.log(`Pendientes: ${pendientes.length}`);
    
    const mensajesEnCola = getMensajesEnCola();
    console.log(`En cola: ${mensajesEnCola}`);
    
    const jobsEnProceso = getJobsEnProceso();
    console.log(`Jobs en proceso: ${jobsEnProceso.length}`);
    
    const estado = getEstadoProceso();
    console.log('Estado actual:', estado);
    
    console.log('✅ Configuración probada correctamente');
    
    SpreadsheetApp.getUi().alert(`✅ Todo OK!\n\nPendientes: ${pendientes.length}\nEn cola: ${mensajesEnCola}\nJobs activos: ${jobsEnProceso.length}\n\nVer logs para más detalles.`);
    
  } catch (error) {
    console.error('Error en probarConfiguracion:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}\n\nVer logs para más detalles.`);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('config');
console.log('VALORES FILA 2 CONFIG:', sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0]);

}

// ========================================
// FUNCIONES DE TRIGGERS CON ID ÚNICO
// ========================================

/**
 * Función principal del trigger con IDs únicos
 */
function procesarSiguienteLote() {
  const horaInicio = new Date();
  console.log(`\n=== TRIGGER AUTOMATION CON IDs - ${horaInicio.toLocaleTimeString()} ===`);
  
  try {
    // 1. Verificar si está pausado
    if (getConfigValue('envios_pausados')) {
      console.log('✋ Sistema pausado - esperando...');
      return;
    }
    
 // 2. Verificar si hay jobs activos - CONDICIÓN REFORZADA
const jobsActivos = getJobsEnProceso();
if (jobsActivos.length > 0) {
  console.log(`✋ TRIGGER DETENIDO - Jobs activos detectados (${jobsActivos.length}):`);
  jobsActivos.forEach(job => {
    console.log(`   - Job ${job.nro_job}: ${job.estado} (${job.total_mensajes} mensajes)`);
  });
  console.log(`⏸️ Esperando que terminen los jobs activos antes de procesar nuevos lotes`);
  return; // SALIR COMPLETAMENTE DEL TRIGGER
}

console.log(`✅ No hay jobs activos - continuando con procesamiento`);
    
    // 3. Verificar si hay mensajes en_cola para procesar
    const mensajesDisponibles = contarMensajesEnColaTrigger();
    if (mensajesDisponibles === 0) {
      console.log('✅ No hay mensajes en_cola para procesar');
      return;
    }
    
    console.log(`📋 Detectados ${mensajesDisponibles} mensajes en_cola esperando procesamiento`);
    
    // 4. Obtener configuración
    const config = getConfig();
    if (!config) {
      console.log('❌ Error: No se pudo leer la configuración');
      return;
    }
    
    // 5. Obtener lote según cantidad_por_lote CON IDs
    const cantidadPorLote = config.cantidad_por_lote || 5;
    const mensajesParaProcesar = getMensajesEnColaParaProcesarTriggerConId(cantidadPorLote);
    
    if (mensajesParaProcesar.length === 0) {
      console.log('✅ No se pudieron obtener mensajes válidos para procesar');
      return;
    }
    
    const nroJob = Date.now().toString();
    
    console.log(`📦 Job ${nroJob} creado por trigger (con IDs):`);
    console.log(`   - ${mensajesParaProcesar.length} mensajes (de ${mensajesDisponibles} disponibles)`);
    console.log(`   - Instancia: ${config.instancia}`);
    console.log(`   - URL: ${config.webhook_n8n}`);
    
    // 6. Crear job en tabla Jobs
    crearNuevoJobTrigger(nroJob, mensajesParaProcesar.length);
    
    // 7. Marcar job como iniciado
    marcarJobComoIniciado(nroJob);
    
    // 8. Actualizar nro_job y timestamp_job usando IDs únicos
    const idsUnicos = mensajesParaProcesar.map(m => m.id);
    actualizarNroJobEnEstadoEnviosPorId(idsUnicos, nroJob);
    
    // 9. Marcar mensajes como procesando usando IDs
    marcarLoteComoProcesandoTriggerPorId(nroJob, idsUnicos);
    
    // 10. Enviar lote a n8n
    enviarLoteAn8nTrigger(nroJob, mensajesParaProcesar, config);
    
    const duracion = new Date() - horaInicio;
    console.log(`✅ Lote procesado exitosamente en ${duracion}ms`);
    console.log(`✅ RESUMEN:`);
    console.log(`   - Job ${nroJob} creado y marcado como procesando`);
    console.log(`   - ${mensajesParaProcesar.length} mensajes actualizados por ID único`);
    console.log(`   - IDs procesados: ${idsUnicos.join(', ')}`);
    console.log(`   - Lote enviado a n8n para procesamiento`);
    
  } catch (error) {
    console.error('❌ Error en procesarSiguienteLote:', error);
  }
}

/**
 * Cuenta mensajes en estado "en_cola"
 */
function contarMensajesEnColaTrigger() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const estadoIndex = headers.indexOf('Estado');
    
    let contador = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][estadoIndex] === 'en_cola') {
        contador++;
      }
    }
    
    return contador;
  } catch (error) {
    console.error('Error contando mensajes en cola:', error);
    return 0;
  }
}

/**
 * Obtiene mensajes en cola CON IDs únicos
 */
function getMensajesEnColaParaProcesarTriggerConId(limite) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idIndex = headers.indexOf('id');
    const timestampEnColaIndex = headers.indexOf('timestamp_en_cola');
    const nroLoteIndex = headers.indexOf('nro_lote');
    const numeroDestinatarioIndex = headers.indexOf('numero_destinatario');
    const mensajeIndex = headers.indexOf('Mensaje');
    const imagenUrlIndex = headers.indexOf('imagen_url');
    const estadoIndex = headers.indexOf('Estado');
    
    if (idIndex === -1 || estadoIndex === -1) {
      throw new Error('Faltan columnas clave (id o Estado)');
    }
    
    const mensajes = [];

    for (let i = 1; i < data.length && mensajes.length < limite; i++) {
      const row = data[i];
      const estado = row[estadoIndex];

      // 🚫 Aceptar solo mensajes cuyo estado sea estrictamente 'en_cola'
      if (estado !== 'en_cola') continue;

      mensajes.push({
        id: row[idIndex],
        fila: i + 1,
        timestamp_en_cola: row[timestampEnColaIndex],
        nro_lote: row[nroLoteIndex],
        numero_destinatario: row[numeroDestinatarioIndex],
        mensaje: row[mensajeIndex],
        imagen_url: row[imagenUrlIndex]
      });
    }

    console.log(`📋 Mensajes obtenidos con IDs únicos en estado 'en_cola':`);
    mensajes.forEach(m => {
      console.log(`   - ID ${m.id}: ${m.numero_destinatario} (Lote: ${m.nro_lote})`);
    });

    return mensajes;
    
  } catch (error) {
    console.error('Error obteniendo mensajes en cola con IDs:', error);
    return [];
  }
}

/**
 * Marca mensajes como "procesando" usando IDs únicos
 */
function marcarLoteComoProcesandoTriggerPorId(nroJob, idsUnicos) {
  try {
    console.log(`🔄 Iniciando marcado de ${idsUnicos.length} mensajes como "procesando" para job ${nroJob}...`);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idIndex = headers.indexOf('id');
    const estadoIndex = headers.indexOf('Estado');

    let marcados = 0;
    const idsSet = new Set(idsUnicos);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const idUnico = row[idIndex];
      const estadoActual = row[estadoIndex];

      if (idsSet.has(idUnico)) {
        if (estadoActual === 'en_cola') {
          sheet.getRange(i + 1, estadoIndex + 1).setValue('procesando');
          marcados++;
          console.log(`✅ ID ${idUnico} (fila ${i + 1}) marcado como "procesando"`);
        } else {
          console.log(`⚠️ ID ${idUnico} (fila ${i + 1}) ya estaba en estado "${estadoActual}" → NO se sobreescribe`);
        }

        idsSet.delete(idUnico);
        if (idsSet.size === 0) break;
      }
    }

    console.log(`✅ Total marcados como "procesando": ${marcados}`);
    console.log(`🔚 Fin del marcado para job ${nroJob}`);

  } catch (error) {
    console.error('❌ Error en marcarLoteComoProcesandoTriggerPorId:', error);
    throw error;
  }
}


/**
 * Crea un nuevo job en la tabla Jobs
 */
function crearNuevoJobTrigger(nroJob, totalMensajes) {
  try {
    console.log(`📝 Creando nuevo job ${nroJob}...`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const timestamp = new Date();
    
    sheet.appendRow([
      timestamp,
      nroJob,
      'trigger_automatico',
      totalMensajes,
      'en_cola',
      '',
      '',
      '',
      '',
      ''
    ]);
    
    console.log(`✅ Job ${nroJob} creado: ${totalMensajes} mensajes, estado=en_cola`);
    
  } catch (error) {
    console.error('Error creando job:', error);
    throw error;
  }
}

/**
 * Marca el job como iniciado
 */
function marcarJobComoIniciado(nroJob) {
  try {
    console.log(`⏰ Marcando job ${nroJob} como iniciado...`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const nroJobIndex = headers.indexOf('nro_job');
    const estadoIndex = headers.indexOf('estado');
    const timestampIniciadoIndex = headers.indexOf('timestamp_iniciado');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[nroJobIndex] === nroJob) {
        sheet.getRange(i + 1, estadoIndex + 1).setValue('procesando');
        
        const timestampIniciado = new Date();
        sheet.getRange(i + 1, timestampIniciadoIndex + 1).setValue(timestampIniciado);
        
        console.log(`✅ Job ${nroJob} marcado como procesando en ${timestampIniciado.toLocaleTimeString()}`);
        break;
      }
    }
    
  } catch (error) {
    console.error('Error marcando job como iniciado:', error);
    throw error;
  }
}

/**
 * Envía el lote a n8n
 */
/**
 * Envía el lote a n8n CON CONFIG COMPLETA E INSTANCIAS
 */
function enviarLoteAn8nTrigger(nroJob, mensajes, config) {
  try {
    const payload = {
      nro_job: nroJob,
      total_mensajes: mensajes.length,
      sheet_id: SpreadsheetApp.getActiveSpreadsheet().getId(),
      timestamp: new Date().toISOString(),
      
      // CONFIG CON LISTA DE INSTANCIAS
      config: {
        wait_min_segundos: config.wait_min_segundos,
        wait_max_segundos: config.wait_max_segundos,
        cantidad_por_lote: config.cantidad_por_lote,
        instancias: config.instancias  // ← LISTA COMPLETA DE INSTANCIAS
      },
      
      // Mensajes con IDs
      mensajes: mensajes.map(m => ({
        id: m.id,
        numero_destinatario: m.numero_destinatario,
        mensaje: m.mensaje,
        imagen_url: m.imagen_url
      }))
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };
    
    console.log(`🚀 Enviando a n8n:`);
    console.log(`   - URL: ${config.webhook_n8n}`);
    console.log(`   - Job: ${nroJob}`);
    console.log(`   - Mensajes: ${mensajes.length}`);
    console.log(`   - Instancias disponibles: ${config.instancias.length}`);
    console.log(`   - Instancia activa: ${config.instancia_activa}`);
    
    const response = UrlFetchApp.fetch(config.webhook_n8n, options);
    
    if (response.getResponseCode() === 200) {
      console.log('✅ Lote enviado exitosamente a n8n');
      console.log(`   - Response: ${response.getContentText()}`);
    } else {
      throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
    }
    
  } catch (error) {
    console.error('❌ Error enviando a n8n:', error);
    throw error;
  }
}

// ========================================
// FUNCIONES DE GESTIÓN DE TRIGGERS
// ========================================

/**
 * Encuentra el intervalo válido más cercano al deseado
 */
function encontrarIntervaloValido(deseado) {
  const intervalosValidos = [1, 5, 10, 15, 30];
  
  if (intervalosValidos.includes(deseado)) {
    return deseado;
  }
  
  let mejorOpcion = intervalosValidos[0];
  let menorDiferencia = Math.abs(deseado - intervalosValidos[0]);
  
  for (let i = 1; i < intervalosValidos.length; i++) {
    const diferencia = Math.abs(deseado - intervalosValidos[i]);
    if (diferencia < menorDiferencia) {
      menorDiferencia = diferencia;
      mejorOpcion = intervalosValidos[i];
    }
  }
  
  return mejorOpcion;
}

/**
 * Instala trigger automático con intervalo personalizado
 */
function instalarTriggerAutomaticoConIntervalo(minutos) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'procesarSiguienteLote') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    ScriptApp.newTrigger('procesarSiguienteLote')
      .timeBased()
      .everyMinutes(minutos)
      .create();
    
    console.log(`Trigger automático instalado (cada ${minutos} minutos)`);
    
  } catch (error) {
    console.error('Error instalando trigger:', error);
    throw error;
  }
}

/**
 * Desinstala el trigger automático
 */
function desinstalarTriggerAutomatico() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let eliminados = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'procesarSiguienteLote') {
        ScriptApp.deleteTrigger(trigger);
        eliminados++;
      }
    });
    
    console.log(`✅ ${eliminados} triggers automáticos eliminados`);
    
    SpreadsheetApp.getUi().alert(`✅ Trigger automático desinstalado\n\n${eliminados} triggers eliminados.\n\nEl procesamiento automático se ha detenido.`);
    
  } catch (error) {
    console.error('❌ Error desinstalando triggers:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}

/**
 * Prueba el trigger manualmente
 */
function probarTriggerManual() {
  try {
    console.log('🧪 PRUEBA MANUAL DEL TRIGGER CON IDs');
    
    if (typeof procesarSiguienteLote === 'function') {
      procesarSiguienteLote();
      SpreadsheetApp.getUi().alert('🧪 Prueba de trigger completada\n\nRevisa los logs en Google Apps Script para ver los detalles.');
    } else {
      SpreadsheetApp.getUi().alert('❌ Error: La función procesarSiguienteLote no está disponible.');
    }
    
  } catch (error) {
    console.error('Error en prueba de trigger:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}

// ========================================
// FUNCIONES PARA N8N CON ID ÚNICO
// ========================================

/**
 * Función para finalizar un job (llamada desde n8n)
 */
function finalizarJob(nroJob, mensajesOk, mensajesError) {
  try {
    console.log(`🏁 Finalizando job ${nroJob}...`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const nroJobIndex = headers.indexOf('nro_job');
    const estadoIndex = headers.indexOf('estado');
    const timestampIniciadoIndex = headers.indexOf('timestamp_iniciado');
    const timestampFinalizadoIndex = headers.indexOf('timestamp_finalizado');
    const mensajesOkIndex = headers.indexOf('mensajes_ok');
    const mensajesErrorIndex = headers.indexOf('mensajes_error');
    const duracionMinutosIndex = headers.indexOf('duracion_minutos');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[nroJobIndex] === nroJob) {
        const timestampIniciado = row[timestampIniciadoIndex];
        const timestampFinalizado = new Date();
        
        let duracionMinutos = '';
        if (timestampIniciado) {
          const duracion = (timestampFinalizado - timestampIniciado) / (1000 * 60);
          duracionMinutos = Math.round(duracion * 100) / 100;
        }
        
        sheet.getRange(i + 1, estadoIndex + 1).setValue('finalizado');
        sheet.getRange(i + 1, timestampFinalizadoIndex + 1).setValue(timestampFinalizado);
        sheet.getRange(i + 1, mensajesOkIndex + 1).setValue(mensajesOk || 0);
        sheet.getRange(i + 1, mensajesErrorIndex + 1).setValue(mensajesError || 0);
        sheet.getRange(i + 1, duracionMinutosIndex + 1).setValue(duracionMinutos);
        
        console.log(`✅ Job ${nroJob} finalizado:`);
        console.log(`   - Duración: ${duracionMinutos} minutos`);
        console.log(`   - Mensajes OK: ${mensajesOk}`);
        console.log(`   - Mensajes Error: ${mensajesError}`);
        break;
      }
    }
    
  } catch (error) {
    console.error('Error finalizando job:', error);
    throw error;
  }
}

/**
 * Función para actualizar resultado por ID único (para n8n)
 */
function actualizarResultadoMensajePorId(idUnico, estado, respuestaApi) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idIndex = headers.indexOf('id');
    const estadoIndex = headers.indexOf('Estado');
    const rtaApiIndex = headers.indexOf('rta_api');
    
    let actualizado = false;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id = row[idIndex];
      
      if (id === idUnico) {
        sheet.getRange(i + 1, estadoIndex + 1).setValue(estado);
        
        if (respuestaApi) {
          sheet.getRange(i + 1, rtaApiIndex + 1).setValue(respuestaApi);
        }
        
        console.log(`✅ Mensaje actualizado por ID: ${idUnico} -> ${estado}`);
        actualizado = true;
        break;
      }
    }
    
    if (!actualizado) {
      console.warn(`⚠️ No se encontró mensaje con ID: ${idUnico}`);
    }
    
    return actualizado;
    
  } catch (error) {
    console.error('Error actualizando resultado por ID:', error);
    throw error;
  }
}

/**
 * Función para actualizar múltiples resultados por IDs (para n8n)
 */
function actualizarResultadosPorIds(resultados) {
  try {
    console.log(`📝 Actualizando ${resultados.length} resultados por IDs...`);
    
    let exitosos = 0;
    let fallidos = 0;
    
    resultados.forEach(resultado => {
      const actualizado = actualizarResultadoMensajePorId(
        resultado.id,
        resultado.estado,
        resultado.respuestaApi
      );
      
      if (actualizado) {
        if (resultado.estado === 'enviado' || resultado.estado === 'entregado') {
          exitosos++;
        } else {
          fallidos++;
        }
      }
    });
    
    console.log(`✅ Resultados actualizados por IDs: ${exitosos} exitosos, ${fallidos} fallidos`);
    
    return { exitosos, fallidos };
    
  } catch (error) {
    console.error('Error actualizando resultados por IDs:', error);
    throw error;
  }
}

/**
 * Función completa para n8n - actualizar job completo por IDs
 */
function completarJobPorIds(nroJob, resultados) {
  try {
    console.log(`🏁 Completando job ${nroJob} con ${resultados.length} resultados por IDs...`);
    
    const { exitosos, fallidos } = actualizarResultadosPorIds(resultados);
    
    finalizarJob(nroJob, exitosos, fallidos);
    
    console.log(`✅ Job ${nroJob} completado: ${exitosos} exitosos, ${fallidos} fallidos`);
    
    return { nroJob, exitosos, fallidos };
    
  } catch (error) {
    console.error('Error completando job por IDs:', error);
    throw error;
  }
}

// ========================================
// FUNCIONES DE MANTENIMIENTO
// ========================================

/**
 * Función para limpiar jobs antiguos
 */
function limpiarJobsAntiguos(diasAntiguedad = 30) {
  try {
    console.log(`🧹 Limpiando jobs anteriores a ${diasAntiguedad} días...`);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const timestampRecibidoIndex = headers.indexOf('timestamp_recibido');
    const estadoIndex = headers.indexOf('estado');
    
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - diasAntiguedad);
    
    let filasEliminadas = 0;
    
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const timestamp = row[timestampRecibidoIndex];
      const estado = row[estadoIndex];
      
      if (estado === 'finalizado' && timestamp < fechaLimite) {
        sheet.deleteRow(i + 1);
        filasEliminadas++;
      }
    }
    
    console.log(`✅ ${filasEliminadas} jobs antiguos eliminados`);
    SpreadsheetApp.getUi().alert(`🧹 Limpieza completada\n\n${filasEliminadas} jobs antiguos eliminados.`);
    
  } catch (error) {
    console.error('Error en limpieza de jobs:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
  }
}

/**
 * Función para obtener estadísticas del sistema
 */
function obtenerEstadisticas() {
  try {
    console.log('📊 Generando estadísticas del sistema...');
    
    const sheetJobs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Jobs');
    const dataJobs = sheetJobs.getDataRange().getValues();
    const headersJobs = dataJobs[0];
    
    let jobsFinalizados = 0;
    let jobsEnProceso = 0;
    let totalMensajesEnviados = 0;
    let totalMensajesOk = 0;
    let totalMensajesError = 0;
    
    const estadoIndex = headersJobs.indexOf('estado');
    const mensajesOkIndex = headersJobs.indexOf('mensajes_ok');
    const mensajesErrorIndex = headersJobs.indexOf('mensajes_error');
    const totalMensajesIndex = headersJobs.indexOf('total_mensajes');
    
    for (let i = 1; i < dataJobs.length; i++) {
      const row = dataJobs[i];
      const estado = row[estadoIndex];
      const mensajesOk = row[mensajesOkIndex] || 0;
      const mensajesError = row[mensajesErrorIndex] || 0;
      const totalMensajes = row[totalMensajesIndex] || 0;
      
      if (estado === 'finalizado') {
        jobsFinalizados++;
        totalMensajesOk += mensajesOk;
        totalMensajesError += mensajesError;
      } else if (estado === 'procesando' || estado === 'en_cola') {
        jobsEnProceso++;
      }
      
      totalMensajesEnviados += totalMensajes;
    }
    
    const sheetEstado = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Estado_envios');
    const dataEstado = sheetEstado.getDataRange().getValues();
    const headersEstado = dataEstado[0];
    
    const estadoEstadoIndex = headersEstado.indexOf('Estado');
    
    let mensajesEnCola = 0;
    let mensajesProcesando = 0;
    let mensajesExitosos = 0;
    let mensajesConError = 0;
    
    for (let i = 1; i < dataEstado.length; i++) {
      const estado = dataEstado[i][estadoEstadoIndex];
      
      switch (estado) {
        case 'en_cola':
          mensajesEnCola++;
          break;
        case 'procesando':
          mensajesProcesando++;
          break;
        case 'enviado':
        case 'entregado':
          mensajesExitosos++;
          break;
        case 'error':
        case 'fallido':
          mensajesConError++;
          break;
      }
    }
    
    const pendientes = getPendientes().length;
    
    const estadisticas = {
      jobs: {
        finalizados: jobsFinalizados,
        en_proceso: jobsEnProceso,
        total_mensajes_enviados: totalMensajesEnviados,
        mensajes_ok: totalMensajesOk,
        mensajes_error: totalMensajesError
      },
      mensajes: {
        pendientes: pendientes,
        en_cola: mensajesEnCola,
        procesando: mensajesProcesando,
        exitosos: mensajesExitosos,
        con_error: mensajesConError
      },
      tasa_exito: totalMensajesEnviados > 0 ? Math.round((totalMensajesOk / totalMensajesEnviados) * 100) : 0
    };
    
    console.log('Estadísticas:', estadisticas);
    
    const mensaje = `📊 ESTADÍSTICAS DEL SISTEMA\n\n` +
                   `🔄 JOBS:\n` +
                   `• Finalizados: ${estadisticas.jobs.finalizados}\n` +
                   `• En proceso: ${estadisticas.jobs.en_proceso}\n` +
                   `• Total mensajes enviados: ${estadisticas.jobs.total_mensajes_enviados}\n\n` +
                   `📱 MENSAJES:\n` +
                   `• Pendientes: ${estadisticas.mensajes.pendientes}\n` +
                   `• En cola: ${estadisticas.mensajes.en_cola}\n` +
                   `• Procesando: ${estadisticas.mensajes.procesando}\n` +
                   `• Exitosos: ${estadisticas.mensajes.exitosos}\n` +
                   `• Con error: ${estadisticas.mensajes.con_error}\n\n` +
                   `✅ Tasa de éxito: ${estadisticas.tasa_exito}%`;
    
    SpreadsheetApp.getUi().alert(mensaje);
    
    return estadisticas;
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    SpreadsheetApp.getUi().alert(`❌ Error: ${error.message}`);
    return null;
  }
}