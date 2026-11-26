/* Invitacion personalizada: /invitacion/<uuid>
   Carga destino + cupos desde la API y confirma asistencia sin contraseña. */
(() => {
  const API = '/api/v1/public/invitaciones';
  const id = location.pathname.split('/').filter(Boolean).pop();

  const $ = (s) => document.querySelector(s);
  const destinoEl = $('#inv-destino');
  const cuposEl = $('#inv-cupos');
  const select = $('#rsvp-cupos');
  const msg = $('#rsvp-msg');
  const yes = $('#yes');
  const no = $('#no');
  const status = $('#rsvp-status');
  const txt = $('#rsvp-txt');
  const waBtn = $('#wa');
  const count = $('#rsvp-count');

  let inv = null;

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const render = () => {
    destinoEl.textContent = inv.destino;
    cuposEl.textContent =
      inv.cupos === 1
        ? 'Hemos reservado 1 cupo para ti'
        : `Hemos reservado ${inv.cupos} cupos para ustedes`;
    document.title = `${inv.destino} · Invitación`;

    select.innerHTML = '';
    for (let i = inv.cupos; i >= 1; i--) {
      select.add(new Option(plural(i, 'persona', 'personas'), i));
    }
    if (inv.cuposConfirmados) select.value = inv.cuposConfirmados;
    if (inv.mensaje) msg.value = inv.mensaje;
    contar();

    if (inv.estado === 'CONFIRMADO') {
      txt.textContent = `¡Ya confirmaste! Te esperamos (${plural(inv.cuposConfirmados, 'persona', 'personas')}). Si cambias de planes puedes actualizar tu respuesta.`;
      yes.textContent = 'Actualizar confirmación';
    } else if (inv.estado === 'RECHAZADO') {
      txt.textContent = 'Nos dijiste que no podrás ir. Si cambias de opinión, aún puedes confirmar.';
      yes.textContent = '¡Sí, allí estaré!';
    }
  };

  const invalida = () => {
    destinoEl.textContent = 'Invitación no encontrada';
    cuposEl.textContent = 'Revisa el link que te enviaron.';
    txt.textContent = 'No pudimos encontrar esta invitación.';
    $('#rsvp-form').style.display = 'none';
    $('.rsvp-actions').style.display = 'none';
  };

  const responder = async (asistira) => {
    yes.disabled = no.disabled = true;
    status.textContent = 'Enviando…';
    try {
      const res = await fetch(`${API}/${id}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asistira,
          cuposConfirmados: asistira ? Number(select.value) : undefined,
          mensaje: msg.value,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'Error');
      inv = json.data;
      render();
      status.textContent = json.message;
    } catch (e) {
      status.textContent = `No se pudo enviar: ${e.message}. Intenta de nuevo.`;
    } finally {
      yes.disabled = no.disabled = false;
    }
  };

  // Contador del mensaje
  const contar = () => { count.textContent = `${msg.value.length} / 500`; };
  msg.addEventListener('input', contar);

  // Confirmar por WhatsApp (opcional): arma el mensaje con nombre, cupos y nota
  waBtn.addEventListener('click', () => {
    const quien = inv?.destino ? ` Soy ${inv.destino}.` : '';
    const cupos = select.value ? ` Asistiremos ${plural(Number(select.value), 'persona', 'personas')}.` : '';
    const nota = msg.value.trim() ? `

${msg.value.trim()}` : '';
    waBtn.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(
      `¡Hola! Confirmo mi asistencia a la boda de ${CONFIG.n1} & ${CONFIG.n2} 🎉${quien}${cupos}${nota}`)}`;
  });

  yes.addEventListener('click', () => responder(true));
  no.addEventListener('click', () => responder(false));

  fetch(`${API}/${id}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((json) => {
      inv = json.data;
      render();
    })
    .catch(invalida);
})();
