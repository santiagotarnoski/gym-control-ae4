'use strict';

const $ = (id) => document.getElementById(id);
const vistas = new Map([...document.querySelectorAll('[data-vista]')].map((vista) => [vista.dataset.vista, vista]));
const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' });
const duracion = (meses) => meses === 1 ? '1 mes' : meses + ' meses';

let sesion = null;
let peticionPlanes;
let planes = [];
let detalleId = null;
let planElegido = null;
let medioElegido = null;
let solicitud = null;
let editarId = null;
let eliminarId = null;
let regresarDespuesDeIngresar = '';
let revisionVista = 0;
let cuentaCompra = null;

class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

async function api(ruta, metodo = 'GET', body, { requiereSesion = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && sesion) headers['X-CSRF-Token'] = sesion.csrf;
  let respuesta;
  try {
    respuesta = await fetch('../api/' + ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('No hay conexión con el servidor.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok || datos === null) {
    if (respuesta.status === 401 && requiereSesion) recuperarAcceso();
    throw new ErrorApi(respuesta.status, datos?.error || 'El servidor no respondió con datos válidos.');
  }
  return datos;
}

function elemento(etiqueta, contenido, clase) {
  const nodo = document.createElement(etiqueta);
  if (contenido !== undefined) nodo.textContent = contenido;
  if (clase) nodo.className = clase;
  return nodo;
}

function enlace(texto, ruta, clase) {
  const nodo = elemento('a', texto, clase);
  nodo.href = '#' + ruta;
  return nodo;
}

function boton(texto, clase, accion) {
  const nodo = elemento('button', texto, clase);
  nodo.type = 'button';
  nodo.addEventListener('click', accion);
  return nodo;
}

function aviso(id, texto, tipo = '') {
  const nodo = $(id);
  nodo.textContent = texto;
  nodo.classList.toggle('error', tipo === 'error');
  nodo.classList.toggle('exito', tipo === 'exito');
}

function datosFormulario(formulario) {
  return Object.fromEntries(new FormData(formulario));
}

function actualizarSesion(nueva) {
  sesion = nueva;
  $('enlace-cuenta').textContent = sesion ? 'Mi cuenta' : 'Ingresar';
  $('enlace-admin').hidden = sesion?.usuario.rol !== 'admin';
}

function recuperarAcceso() {
  const { nombre, id } = rutaActual();
  const plan = planElegido ?? id;
  regresarDespuesDeIngresar = nombre === 'elegir' ? 'elegir' + (plan ? '/' + plan : '') : '';
  actualizarSesion(null);
  // Oculta los controles protegidos mientras se muestra el ingreso.
  $('form-membresia').hidden = true;
  $('form-consulta').hidden = true;
  $('panel-admin').hidden = true;
  $('confirmacion-baja').hidden = true;
  if (nombre === 'cuenta') pintarCuenta();
  else location.hash = 'cuenta';
  aviso('estado-ingreso', 'Tu sesión venció. Ingresá nuevamente para continuar.', 'error');
}

async function cargarSesion() {
  try {
    actualizarSesion(await api('login.php'));
  } catch (error) {
    if (error.estado !== 401) throw error;
    actualizarSesion(null);
  }
}

async function obtenerPlanes() {
  peticionPlanes ??= api('planes.php').catch((error) => {
    peticionPlanes = undefined;
    throw error;
  });
  const datos = await peticionPlanes;
  planes = datos.planes;
  return planes;
}

function normalizar(texto) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function pintarTarjetas() {
  const busqueda = normalizar($('buscar-plan').value);
  const meses = $('filtrar-duracion').value;
  const filtrados = planes.filter((plan) =>
    (!meses || plan.duracion_meses === Number(meses))
    && normalizar([plan.nombre, plan.categoria, plan.descripcion].join(' ')).includes(busqueda)
  );
  const tarjetas = filtrados.map((plan) => {
    const tarjeta = elemento('article', undefined, 'plan-card');
    tarjeta.append(
      elemento('span', plan.categoria, 'plan-tag'),
      elemento('h2', plan.nombre),
      elemento('p', duracion(plan.duracion_meses), 'plan-duration'),
      elemento('p', moneda.format(plan.precio), 'price-cell'),
      elemento('p', plan.descripcion, 'plan-description')
    );
    const acciones = elemento('div', undefined, 'link-grupo');
    const ver = enlace('Ver detalle', 'detalle/' + plan.id, 'button button-outline button-small');
    ver.setAttribute('aria-label', 'Ver detalle de ' + plan.nombre);
    acciones.append(ver);
    tarjeta.append(acciones);
    return tarjeta;
  });
  $('catalogo-planes').replaceChildren(...tarjetas);
  aviso('estado-planes', filtrados.length ? filtrados.length + ' planes encontrados.' : 'No encontramos planes con esos filtros.');
}

function pintarTabla() {
  $('tabla-planes').replaceChildren(...planes.map((plan) => {
    const fila = elemento('tr');
    const titulo = elemento('th', plan.nombre);
    titulo.scope = 'row';
    const accion = elemento('td');
    const ver = enlace('Ver detalle', 'detalle/' + plan.id, 'button button-outline button-small');
    ver.setAttribute('aria-label', 'Ver detalle de ' + plan.nombre);
    accion.append(ver);
    fila.append(titulo, elemento('td', duracion(plan.duracion_meses)), elemento('td', moneda.format(plan.precio)), elemento('td', plan.descripcion), accion);
    return fila;
  }));
}

function actualizarDetalle(plan) {
  detalleId = plan.id;
  $('detalle-nombre').textContent = plan.nombre;
  $('detalle-duracion').textContent = duracion(plan.duracion_meses);
  $('detalle-precio').textContent = moneda.format(plan.precio);
  $('detalle-categoria').textContent = plan.categoria;
  $('detalle-descripcion').textContent = plan.descripcion;
  $('elegir-desde-detalle').href = '#elegir/' + plan.id;
  $('detalle-datos').hidden = false;
  $('seccion-consulta').hidden = false;
  const socio = sesion?.usuario.rol === 'socio';
  $('form-consulta').hidden = !socio;
  $('acceso-consulta').hidden = socio || sesion?.usuario.rol === 'admin';
}

function marcarOpcion(contenedor, valor) {
  for (const opcion of $(contenedor).querySelectorAll('button')) {
    opcion.setAttribute('aria-pressed', String(opcion.dataset.valor === String(valor)));
  }
}

function leerCupon() {
  return $('codigo-cupon').value.trim().toUpperCase();
}

function actualizarTotal() {
  const plan = planes.find((item) => item.id === planElegido);
  const cantidad = $('cantidad').valueAsNumber;
  if (!plan || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) {
    $('estado-total').textContent = 'Elegí un plan y una cantidad de 1 a 20 períodos.';
    return;
  }
  const subtotal = plan.precio * cantidad;
  const descuento = leerCupon() === 'UCP10' ? Math.floor(subtotal / 10) : 0;
  $('estado-total').textContent = 'Subtotal ' + moneda.format(subtotal) + ' · Descuento ' + moneda.format(descuento) + ' · Total ' + moneda.format(subtotal - descuento);
}

function pintarEleccion(id, ruta) {
  const cuenta = sesion?.usuario;
  const socio = cuenta?.rol === 'socio';
  $('ingresar-para-elegir').hidden = Boolean(cuenta);
  if (!cuenta) {
    regresarDespuesDeIngresar = ruta;
    aviso('estado-elegir', 'Ingresá con tu cuenta de socio para confirmar el plan.');
  }
  if (cuenta?.rol === 'admin') {
    aviso('estado-elegir', 'Las membresías se asignan a cuentas de socio.');
  }
  if (!socio) return;

  if (cuentaCompra !== cuenta.id) {
    $('form-membresia').reset();
    cuentaCompra = cuenta.id;
    $('compra-nombre').value = cuenta.nombre;
    $('compra-email').value = cuenta.email;
    planElegido = null;
    medioElegido = null;
    solicitud = null;
    marcarOpcion('medios-pago', null);
  }
  $('form-membresia').hidden = planes.length === 0;
  if (!planes.length) aviso('estado-elegir', 'Todavía no hay planes disponibles.');
  if (id || !planes.some((plan) => plan.id === planElegido)) {
    planElegido = planes.find((plan) => plan.id === id)?.id ?? null;
  }
  $('opciones-planes').replaceChildren(...planes.map((plan) => {
    const opcion = boton(plan.nombre + ' · ' + moneda.format(plan.precio), 'choice-card', () => {
      planElegido = plan.id;
      marcarOpcion('opciones-planes', planElegido);
      actualizarTotal();
    });
    opcion.dataset.valor = plan.id;
    return opcion;
  }));
  marcarOpcion('opciones-planes', planElegido);
  actualizarTotal();
}

function pintarCuenta() {
  const usuario = sesion?.usuario;
  $('vista-visitante').hidden = Boolean(usuario);
  $('vista-socio').hidden = !usuario;
  $('cuenta-admin').hidden = usuario?.rol !== 'admin';
  $('socio-renovar').hidden = usuario?.rol !== 'socio';
  $('socio-renovar').textContent = 'Elegir plan';
  $('socio-renovar').href = '#elegir';
  $('historial').replaceChildren();
  if (usuario) $('saludo-socio').textContent = 'Hola, ' + usuario.nombre;
}

function pintarHistorial({ membresias, hoy }) {
  if (!membresias.length) {
    $('historial').replaceChildren(elemento('p', 'Todavía no tenés una membresía.'));
    return;
  }
  const actual = membresias.find((item) => item.inicio <= hoy && hoy < item.fin) ?? membresias[0];
  $('socio-renovar').href = '#elegir/' + actual.plan_id;
  $('socio-renovar').textContent = 'Renovar plan';
  const tarjetas = membresias.map((item) => {
    const tarjeta = elemento('article', undefined, 'historial-item');
    const dias = Math.round((Date.parse(item.fin) - Date.parse(hoy)) / 86400000);
    let estado = 'Activa';
    if (hoy < item.inicio) estado = 'Programada';
    else if (dias <= 0) estado = 'Vencida';
    else if (dias <= 7) estado = 'Por vencer';
    tarjeta.append(
      elemento('h3', item.plan_nombre),
      elemento('p', estado + ' · Desde ' + fecha.format(new Date(item.inicio)) + ' hasta ' + fecha.format(new Date(item.fin)) + ' (fecha de vencimiento)'),
      elemento('p', item.cantidad + ' período(s) · Medio: ' + item.medio_pago + ' · Total: ' + moneda.format(item.total))
    );
    return tarjeta;
  });
  $('historial').replaceChildren(...tarjetas);
}

function pintarAdmin() {
  $('lista-admin').replaceChildren(...planes.map((plan) => {
    const item = elemento('article');
    const acciones = elemento('div', undefined, 'link-grupo');
    const editar = boton('Editar', 'button button-outline button-small', () => abrirEditor(plan));
    const eliminar = boton('Eliminar', 'button button-ghost button-small', () => {
      eliminarId = plan.id;
      $('pregunta-baja').textContent = '¿Eliminar ' + plan.nombre + '?';
      $('confirmacion-baja').hidden = false;
      $('confirmar-baja').focus();
    });
    editar.setAttribute('aria-label', 'Editar ' + plan.nombre);
    eliminar.setAttribute('aria-label', 'Eliminar ' + plan.nombre);
    acciones.append(editar, eliminar);
    item.append(elemento('h3', plan.nombre), elemento('p', duracion(plan.duracion_meses) + ' · ' + moneda.format(plan.precio)), acciones);
    return item;
  }));
  if (!planes.length) $('lista-admin').append(elemento('p', 'Todavía no hay planes publicados.'));
}

function abrirEditor(plan) {
  const form = $('form-plan');
  form.reset();
  editarId = plan?.id ?? null;
  $('titulo-editor').textContent = plan ? 'Editar plan' : 'Crear plan';
  $('guardar-plan').textContent = plan ? 'Guardar cambios' : 'Crear plan';
  $('cancelar-edicion').hidden = !plan;
  if (plan) {
    for (const input of form.querySelectorAll('[name]')) input.value = plan[input.name];
  }
  aviso('estado-editor', '');
  $('titulo-editor').focus();
}

function rutaActual() {
  const [nombre, parametro] = location.hash.slice(1).split('/');
  return { nombre: vistas.has(nombre) ? nombre : 'inicio', id: Number(parametro) || null };
}

async function navegar(moverFoco = true) {
  const revision = ++revisionVista;
  const { nombre, id } = rutaActual();
  const vista = vistas.get(nombre);
  for (const [otra, seccion] of vistas) seccion.hidden = otra !== nombre;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav === nombre) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const titulo = vista.querySelector('h1');
  if (nombre === 'detalle') titulo.textContent = 'Detalle del plan';
  document.title = (nombre === 'inicio' ? 'Inicio' : titulo.textContent) + ' | Gym Control';
  if (moverFoco) {
    window.scrollTo(0, 0);
    titulo.focus({ preventScroll: true });
  }

  const estado = $('estado-' + nombre);
  const reintentar = vista.querySelector('[data-reintentar]');
  if (estado) estado.textContent = 'Cargando…';
  if (reintentar) reintentar.hidden = true;

  try {
    if (nombre === 'detalle') {
      $('detalle-datos').hidden = true;
      $('seccion-consulta').hidden = true;
      $('form-consulta').reset();
      aviso('estado-consulta', '');
      const [detalle] = await Promise.all([api('planes.php?id=' + (id ?? '')), cargarSesion()]);
      if (revision !== revisionVista) return;
      actualizarDetalle(detalle.plan);
      document.title = detalle.plan.nombre + ' | Gym Control';
    } else if (nombre === 'cuenta') {
      await cargarSesion();
      if (revision !== revisionVista) return;
      pintarCuenta();
      if (sesion?.usuario.rol === 'socio') {
        const historial = await api('membresias.php', 'GET', undefined, { requiereSesion: true });
        if (revision !== revisionVista) return;
        pintarHistorial(historial);
      }
    } else if (nombre === 'elegir' || nombre === 'admin') {
      $('form-membresia').hidden = true;
      $('ver-membresia').hidden = true;
      $('ingresar-para-elegir').hidden = true;
      $('panel-admin').hidden = true;
      $('admin-ingresar').hidden = true;
      await cargarSesion();
      if (revision !== revisionVista) return;
      if (nombre === 'admin' && sesion?.usuario.rol !== 'admin') {
        $('admin-ingresar').hidden = false;
        aviso('estado-admin', 'Esta sección requiere una cuenta de administrador.');
        return;
      }
      if (nombre === 'admin' || sesion?.usuario.rol === 'socio') await obtenerPlanes();
      if (revision !== revisionVista) return;
      estado.textContent = '';
      if (nombre === 'elegir') {
        aviso('estado-compra', '');
        pintarEleccion(id, 'elegir' + (id ? '/' + id : ''));
      } else {
        $('panel-admin').hidden = false;
        pintarAdmin();
      }
      return;
    } else {
      await obtenerPlanes();
      if (revision !== revisionVista) return;
      if (nombre === 'inicio') {
        $('numero-planes').textContent = planes.length;
        const meses = [...new Set(planes.map((plan) => plan.duracion_meses))].slice(0, 6);
        $('resumen-duracion').replaceChildren(...meses.map((valor) => elemento('span', duracion(valor))));
      }
      if (nombre === 'tabla') pintarTabla();
      if (nombre === 'planes') {
        pintarTarjetas();
        return;
      }
    }
    if (estado) estado.textContent = nombre === 'tabla' && !planes.length ? 'Todavía no hay planes disponibles.' : '';
  } catch (error) {
    if (revision !== revisionVista) return;
    if (estado) estado.textContent = error.message;
    if (nombre === 'inicio') $('numero-planes').textContent = 'Sin datos';
    if (reintentar) reintentar.hidden = error.estado === 404;
  }
}

async function accion(control, estado, ejecutar) {
  if (control.disabled) return;
  control.disabled = true;
  aviso(estado, 'Procesando…');
  try {
    await ejecutar();
  } catch (error) {
    aviso(estado, error.message, 'error');
  } finally {
    control.disabled = false;
  }
}

function alEnviar(id, estado, ejecutar) {
  $(id).addEventListener('submit', (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    accion(form.querySelector('button[type="submit"]'), estado, () => ejecutar(form));
  });
}

async function ingresar(datos, form) {
  actualizarSesion(await api('login.php', 'POST', datos));
  aviso('estado-ingreso', '');
  aviso('estado-registro', '');
  form.reset();
  const siguiente = regresarDespuesDeIngresar;
  regresarDespuesDeIngresar = '';
  if (siguiente && sesion.usuario.rol === 'socio') location.hash = siguiente;
  else await navegar();
}

alEnviar('form-ingreso', 'estado-ingreso', (form) => ingresar(datosFormulario(form), form));
alEnviar('form-registro', 'estado-registro', async (form) => {
  const { nombre, email, clave, repetir_clave } = datosFormulario(form);
  if (clave !== repetir_clave) throw new Error('Las claves no coinciden.');
  await api('usuarios.php', 'POST', { nombre, email, clave });
  await ingresar({ email, clave }, form);
});
$('cerrar-sesion').addEventListener('click', () => accion($('cerrar-sesion'), 'estado-cuenta', async () => {
  await api('login.php', 'DELETE', undefined, { requiereSesion: true });
  actualizarSesion(null);
  $('form-ingreso').reset();
  $('form-registro').reset();
  cuentaCompra = null;
  await navegar();
}));

$('filtros').addEventListener('input', pintarTarjetas);
$('filtros').addEventListener('reset', () => setTimeout(pintarTarjetas, 0));
$('filtros').addEventListener('submit', (evento) => {
  evento.preventDefault();
  pintarTarjetas();
});
for (const medio of $('medios-pago').querySelectorAll('button')) {
  medio.addEventListener('click', () => {
    medioElegido = medio.dataset.valor;
    marcarOpcion('medios-pago', medioElegido);
  });
}
$('cantidad').addEventListener('input', actualizarTotal);
$('codigo-cupon').addEventListener('input', () => {
  aviso('estado-cupon', '');
  actualizarTotal();
});
$('validar-cupon').addEventListener('click', () => {
  const cupon = leerCupon();
  if (cupon === 'UCP10') aviso('estado-cupon', 'Cupón válido. Se aplica un 10 % de descuento.', 'exito');
  else aviso('estado-cupon', cupon ? 'El cupón no está vigente.' : 'Ingresá el código para validarlo.', 'error');
});
alEnviar('form-membresia', 'estado-compra', async (form) => {
  if (!planElegido || !medioElegido) throw new Error('Elegí un plan y un medio de pago.');
  const ruta = location.hash;
  const datos = {
    ...datosFormulario(form),
    plan_id: planElegido, medio_pago: medioElegido, cupon: leerCupon(),
  };
  const firma = JSON.stringify(datos);
  if (solicitud?.firma !== firma) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    solicitud = { firma, id: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') };
  }
  const { membresia } = await api('membresias.php', 'POST', { ...datos, solicitud: solicitud.id }, { requiereSesion: true });
  if (location.hash !== ruta) return;
  $('form-membresia').hidden = true;
  aviso('estado-elegir', 'Membresía #' + membresia.id + ' registrada. Total: ' + moneda.format(membresia.total) + '.');
  $('ver-membresia').hidden = false;
  $('ver-membresia').focus();
  solicitud = null;
});

alEnviar('form-consulta', 'estado-consulta', async (form) => {
  const datos = await api('consultas.php', 'POST', { plan_id: detalleId, ...datosFormulario(form) }, { requiereSesion: true });
  form.reset();
  aviso('estado-consulta', datos.mensaje + ' Número: ' + datos.id + '.', 'exito');
});

alEnviar('form-plan', 'estado-editor', async (form) => {
  const id = editarId;
  await api(id ? 'planes.php?id=' + id : 'planes.php', id ? 'PUT' : 'POST', datosFormulario(form), { requiereSesion: true });
  peticionPlanes = undefined;
  abrirEditor(null);
  await obtenerPlanes();
  pintarAdmin();
  aviso('estado-editor', id ? 'Cambios guardados.' : 'Plan creado.', 'exito');
});
$('cancelar-edicion').addEventListener('click', () => abrirEditor(null));
$('cancelar-baja').addEventListener('click', () => {
  $('confirmacion-baja').hidden = true;
  $('lista-admin').querySelector('button')?.focus();
});
$('confirmar-baja').addEventListener('click', () => accion($('confirmar-baja'), 'estado-lista-admin', async () => {
  await api('planes.php?id=' + eliminarId, 'DELETE', undefined, { requiereSesion: true });
  peticionPlanes = undefined;
  $('confirmacion-baja').hidden = true;
  if (editarId === eliminarId) abrirEditor(null);
  await obtenerPlanes();
  pintarAdmin();
  aviso('estado-lista-admin', 'Plan eliminado.', 'exito');
  $('lista-admin').querySelector('button')?.focus();
}));

document.querySelector('.skip-link').addEventListener('click', (evento) => {
  evento.preventDefault();
  $('contenido').focus();
});
for (const control of document.querySelectorAll('[data-reintentar]')) {
  control.addEventListener('click', () => navegar(false));
}
window.addEventListener('hashchange', () => navegar());
navegar(false);
cargarSesion().catch(() => {});
