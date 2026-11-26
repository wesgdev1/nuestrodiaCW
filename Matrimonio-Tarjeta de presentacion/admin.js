/* Panel admin de invitaciones (solo el admin inicia sesion) */
(() => {
  /* ====== DATOS DEL EVENTO (para el mensaje de WhatsApp) ====== */
  const EVENTO = {
    pareja: 'Kandy & Welinton',
    fecha: 'Sábado 20 de febrero de 2027',
    hora: '4:00 p. m.',
    lugar: 'Palmas Golf',
    ciudad: 'Villa del Rosario',
    boda: '2027-02-20T16:00:00',
    countryCode: '57',
  };
  /* ============================================================ */

  const API = '/api/v1';
  const $ = (s) => document.querySelector(s);

  let token = localStorage.getItem('adminToken');
  let all = [];
  let editingId = null;
  let confirmingId = null;
  let previewing = null;
  const filtros = { q: '', estado: '', enviada: '', grupo: '' };

  const ESTADOS = {
    CONFIRMADO: { label: 'Confirmado', color: 'var(--ok)', bg: 'var(--ok-bg)' },
    PENDIENTE: { label: 'Pendiente', color: 'var(--wait)', bg: 'var(--wait-bg)' },
    RECHAZADO: { label: 'No asiste', color: 'var(--no)', bg: 'var(--no-bg)' },
  };
  const METODOS = { WEB: 'Web', WHATSAPP: 'WhatsApp', LLAMADA: 'Llamada', MANUAL: 'Manual' };

  // ---------- helpers ----------
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const icon = (id, fill = false) => `<svg class="ic${fill ? ' fill' : ''}"><use href="#i-${id}"/></svg>`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const iniciales = (s) =>
    String(s).split(/\s+y\s+|\s+&\s+|\s+/i).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const fecha = (d) =>
    d ? new Date(d).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  const hace = (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    if (s < 604800) return `hace ${Math.floor(s / 86400)} d`;
    return fecha(d);
  };

  const toast = (text, ic = 'check') => {
    const t = $('#toast');
    t.innerHTML = `${icon(ic)}<span>${esc(text)}</span>`;
    t.classList.add('on');
    clearTimeout(toast.id);
    toast.id = setTimeout(() => t.classList.remove('on'), 2400);
  };

  const copy = async (text, ok = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(ok);
  };

  const api = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if ((res.status === 401 || res.status === 403) && path !== '/users/signin') logout();
    if (!res.ok) throw new Error(json.error?.message || `Error ${res.status}`);
    return json;
  };

  // ---------- mensaje WhatsApp ----------
  const buildMensaje = (x) => {
    const varios = x.cupos > 1;
    return [
      '💍 *¡Nos casamos!* 💍',
      '',
      `Hola *${x.destino}* 🤍`,
      '',
      `Con muchísima alegría queremos invitar${varios ? 'los' : 'te'} a celebrar con nosotros el día más especial de nuestras vidas.`,
      '',
      `📅 *${EVENTO.fecha}*`,
      `🕓 ${EVENTO.hora}`,
      `📍 ${EVENTO.lugar} · ${EVENTO.ciudad}`,
      '',
      `🎟️ Hemos reservado *${plural(x.cupos, 'cupo', 'cupos')}* para ${varios ? 'ustedes' : 'ti'}.`,
      '',
      '✨ Abre tu invitación y confirma tu asistencia aquí 👇',
      x.link,
      '',
      `¡${varios ? 'Los' : 'Te'} esperamos! 🥂`,
      `*${EVENTO.pareja}*`,
    ].join('\n');
  };

  const telefonoWa = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    return d.length === 10 ? EVENTO.countryCode + d : d;
  };

  // api.whatsapp.com conserva bien los emojis (wa.me a veces los rompe al redirigir)
  const whatsappUrl = (x) => {
    const params = new URLSearchParams();
    const phone = telefonoWa(x.telefono);
    if (phone) params.set('phone', phone);
    params.set('text', buildMensaje(x));
    return `https://api.whatsapp.com/send?${params.toString().replace(/\+/g, '%20')}`;
  };

  // ---------- auth ----------
  const showLogin = () => {
    $('#login').hidden = false;
    $('#panel').hidden = true;
  };

  function logout() {
    token = null;
    localStorage.removeItem('adminToken');
    showLogin();
  }

  $('#logout').onclick = logout;

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('#login-error').textContent = '';
    try {
      const json = await api('/users/signin', {
        method: 'POST',
        body: { email: f.get('email'), password: f.get('password') },
      });
      token = json.meta.token;
      localStorage.setItem('adminToken', token);
      start();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  };

  // ---------- datos ----------
  const load = async () => {
    try {
      const { data } = await api('/invitaciones');
      all = data;
      render();
    } catch (e) {
      toast(e.message, 'x');
    }
  };

  // ---------- dashboard ----------
  const renderDashboard = () => {
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
    const by = (e) => all.filter((x) => x.estado === e);

    const cupos = sum(all, 'cupos');
    const conf = sum(all, 'cuposConfirmados');
    const pend = sum(by('PENDIENTE'), 'cupos');
    const rech = sum(by('RECHAZADO'), 'cupos');

    // Hero personas
    $('#h-conf').textContent = conf;
    $('#h-total').textContent = `de ${plural(cupos, 'cupo', 'cupos')}`;
    $('#pct-tag').textContent = `${pct(conf, cupos)}%`;
    const seg = [
      ['Confirmadas', conf, 'var(--ok)'],
      ['Pendientes', pend, '#e8c77a'],
      ['No asisten', rech, '#e7a39b'],
    ];
    $('#h-bar').innerHTML = seg.map(([, v, c]) => `<i style="width:${pct(v, cupos)}%;background:${c}"></i>`).join('');
    $('#h-legend').innerHTML = seg
      .map(([l, v, c]) => `<span><i class="dot" style="background:${c}"></i>${l} <b style="color:var(--ink)">${v}</b></span>`)
      .join('');

    // KPIs (embudo)
    const total = all.length;
    const enviadas = all.filter((x) => x.enviada).length;
    const abiertas = all.filter((x) => x.vistas > 0).length;
    const respondidas = all.filter((x) => x.estado !== 'PENDIENTE').length;
    const kpis = [
      ['Invitaciones', total, 'mail', '100', `${plural(cupos, 'cupo', 'cupos')} en total`],
      ['Enviadas', enviadas, 'send', pct(enviadas, total), `${pct(enviadas, total)}% · faltan ${total - enviadas}`],
      ['Abiertas', abiertas, 'open', pct(abiertas, enviadas || total), `${pct(abiertas, enviadas)}% de las enviadas`],
      ['Respondidas', respondidas, 'heart', pct(respondidas, total), `${pct(respondidas, total)}% del total`],
    ];
    $('#kpis').innerHTML = kpis
      .map(
        ([l, v, ic, w, s]) => `
      <section class="card kpi">
        <div class="kpi-top"><span>${l}</span><span class="kpi-ic">${icon(ic)}</span></div>
        <b>${v}</b>
        <div class="mini"><i style="width:${w}%"></i></div>
        <small>${s}</small>
      </section>`,
      )
      .join('');

    // Donut estados
    $('#d-total').textContent = total;
    let offset = 0;
    const ring = `<circle cx="21" cy="21" r="15.915" stroke="var(--soft)"></circle>`;
    const arcs = Object.entries(ESTADOS)
      .map(([k, e]) => {
        const p = pct(by(k).length, total);
        const c = `<circle cx="21" cy="21" r="15.915" stroke="${e.color}" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${-offset}"></circle>`;
        offset += p;
        return p ? c : '';
      })
      .join('');
    $('#donut').innerHTML = ring + arcs;
    $('#d-legend').innerHTML = Object.entries(ESTADOS)
      .map(([k, e]) => `<div><span><i class="dot" style="background:${e.color}"></i>${e.label}</span><b>${by(k).length}</b></div>`)
      .join('');

    // Grupos
    const grupos = {};
    for (const x of all) {
      const g = x.grupo || 'Sin grupo';
      grupos[g] ??= { cupos: 0, conf: 0 };
      grupos[g].cupos += x.cupos;
      grupos[g].conf += x.cuposConfirmados;
    }
    const gs = Object.entries(grupos).sort((a, b) => b[1].cupos - a[1].cupos);
    $('#groups').innerHTML =
      gs
        .map(
          ([g, v]) => `
      <div class="group-row">
        <div class="t"><b style="font-weight:500">${esc(g)}</b><span>${v.conf} / ${v.cupos}</span></div>
        <div class="mini"><i style="width:${pct(v.conf, v.cupos)}%"></i></div>
      </div>`,
        )
        .join('') || '<div class="empty">Aún no hay grupos</div>';

    // Feed respuestas
    const recientes = all
      .filter((x) => x.fechaRespuesta)
      .sort((a, b) => new Date(b.fechaRespuesta) - new Date(a.fechaRespuesta))
      .slice(0, 8);
    $('#feed').innerHTML =
      recientes
        .map((x) => {
          const e = ESTADOS[x.estado];
          const txt =
            x.estado === 'CONFIRMADO'
              ? `confirmó ${plural(x.cuposConfirmados, 'persona', 'personas')}`
              : 'no podrá asistir';
          return `
        <div class="feed-item">
          <div class="avatar" style="background:${e.bg};color:${e.color}">${esc(iniciales(x.destino))}</div>
          <div>
            <b>${esc(x.destino)}</b>
            <p>${txt} · ${METODOS[x.metodoConfirmacion] || ''} · ${hace(x.fechaRespuesta)}</p>
            ${x.mensaje ? `<q>${esc(x.mensaje)}</q>` : ''}
          </div>
        </div>`;
        })
        .join('') || '<div class="empty">Todavía nadie ha respondido</div>';

    // Countdown
    const dias = Math.max(0, Math.ceil((new Date(EVENTO.boda) - Date.now()) / 86400000));
    $('#cd-days').textContent = dias;
    $('#cd-text').textContent = dias === 1 ? 'día para el gran día' : 'días para el gran día';
  };

  // ---------- filtros ----------
  const renderFiltros = () => {
    const count = (e) => (e ? all.filter((x) => x.estado === e).length : all.length);
    const chips = [['', 'Todas'], ['PENDIENTE', 'Pendientes'], ['CONFIRMADO', 'Confirmadas'], ['RECHAZADO', 'No asisten']];
    $('#f-estado').innerHTML = chips
      .map(([v, l]) => `<button class="chip${filtros.estado === v ? ' on' : ''}" data-v="${v}">${l}<em>${count(v)}</em></button>`)
      .join('');

    const grupos = [...new Set(all.map((x) => x.grupo).filter(Boolean))].sort();
    const sel = $('#f-grupo');
    sel.innerHTML =
      '<option value="">Grupo: todos</option>' + grupos.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    sel.value = grupos.includes(filtros.grupo) ? filtros.grupo : '';
    $('#grupos').innerHTML = grupos.map((g) => `<option value="${esc(g)}">`).join('');
  };

  const filtrar = () => {
    const q = filtros.q.toLowerCase();
    return all.filter(
      (x) =>
        (!filtros.estado || x.estado === filtros.estado) &&
        (!filtros.enviada || String(x.enviada) === filtros.enviada) &&
        (!filtros.grupo || x.grupo === filtros.grupo) &&
        (!q || [x.destino, x.telefono, x.email].some((v) => String(v || '').toLowerCase().includes(q))),
    );
  };

  // ---------- tabla ----------
  const renderTabla = () => {
    const rows = filtrar();
    $('#count').textContent = `· ${rows.length}`;

    $('#rows').innerHTML =
      rows
        .map((x) => {
          const e = ESTADOS[x.estado];
          const seats = Array.from({ length: Math.min(x.cupos, 12) }, (_, i) => `<i class="${i < x.cuposConfirmados ? 'on' : ''}"></i>`).join('');
          return `
      <tr data-id="${x.id}">
        <td data-l="Invitado">
          <div class="who">
            <b>${esc(x.destino)}</b>
            ${x.telefono ? `<small>${icon('phone')}${esc(x.telefono)}</small>` : '<small class="faint">Sin teléfono</small>'}
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
              ${x.grupo ? `<span class="tag">${esc(x.grupo)}</span>` : ''}
              ${x.notas ? `<span class="tag" title="${esc(x.notas)}">${icon('note')}nota</span>` : ''}
            </div>
          </div>
        </td>
        <td data-l="Cupos">
          <b style="font-weight:500">${x.cuposConfirmados}</b><span class="faint"> / ${x.cupos}</span>
          <div class="seats">${seats}</div>
        </td>
        <td data-l="Estado">
          <span class="badge ${x.estado}"><span class="dot"></span>${e.label}</span>
          ${x.fechaRespuesta ? `<span class="sub">${METODOS[x.metodoConfirmacion] || ''} · ${fecha(x.fechaRespuesta)}</span>` : ''}
        </td>
        <td data-l="Seguimiento">
          <div class="track">
            <span class="${x.enviada ? 'yes' : ''}">${icon(x.enviada ? 'check' : 'send')}${x.enviada ? `Enviada ${fecha(x.fechaEnvio)}` : 'Sin enviar'}</span>
            <span class="${x.vistas ? 'yes' : ''}">${icon('eye')}${x.vistas ? `${plural(x.vistas, 'vista', 'vistas')} · ${hace(x.ultimaVista)}` : 'No abierta'}</span>
          </div>
        </td>
        <td data-l="Mensaje"><div class="note">${x.mensaje ? `“${esc(x.mensaje)}”` : '<span class="faint" style="font-style:normal">—</span>'}</div></td>
        <td>
          <div class="acts">
            <button class="btn wa sm" data-a="whatsapp" title="Enviar por WhatsApp">${icon('wa', true)}WhatsApp</button>
            <button class="btn ghost icon" data-a="copiarMensaje" title="Copiar mensaje">${icon('msg')}</button>
            <button class="btn ghost icon" data-a="copiarLink" title="Copiar link">${icon('link')}</button>
            <details class="menu">
              <summary class="btn ghost icon" title="Más opciones">${icon('more')}</summary>
              <div class="menu-list">
                <button data-a="preview">${icon('msg')}Ver mensaje</button>
                <button data-a="ver">${icon('eye')}Abrir invitación</button>
                ${x.enviada ? '' : `<button data-a="marcarEnviada">${icon('send')}Marcar como enviada</button>`}
                <hr>
                <button data-a="confirmar">${icon('check')}Confirmar asistencia</button>
                <button data-a="rechazar">${icon('x')}Marcar que no asiste</button>
                ${x.estado !== 'PENDIENTE' ? `<button data-a="reset">${icon('reset')}Volver a pendiente</button>` : ''}
                <hr>
                <button data-a="editar">${icon('edit')}Editar</button>
                <button data-a="eliminar" class="danger">${icon('trash')}Eliminar</button>
              </div>
            </details>
          </div>
        </td>
      </tr>`;
        })
        .join('') ||
      `<tr><td colspan="6"><div class="empty">${all.length ? 'Ninguna invitación coincide con los filtros' : 'Aún no hay invitaciones. Crea la primera con “Nueva”.'}</div></td></tr>`;
  };

  const render = () => {
    renderDashboard();
    renderFiltros();
    renderTabla();
  };

  // ---------- dialogs ----------
  document.querySelectorAll('dialog [data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    }),
  );

  const openForm = (x = null) => {
    editingId = x?.id || null;
    const f = $('#inv-form');
    f.reset();
    for (const k of ['destino', 'cupos', 'telefono', 'grupo', 'notas']) f.elements[k].value = x?.[k] ?? (k === 'cupos' ? 1 : '');
    $('#form-title').textContent = x ? 'Editar invitación' : 'Nueva invitación';
    $('#form-submit').textContent = x ? 'Guardar cambios' : 'Crear invitación';
    $('#dlg-form').showModal();
    f.elements.destino.focus();
  };

  $('#btn-new').onclick = () => openForm();

  $('#inv-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.cupos = Number(body.cupos);
    try {
      if (editingId) {
        await api(`/invitaciones/${editingId}`, { method: 'PUT', body });
        toast('Invitación actualizada');
      } else {
        await api('/invitaciones', { method: 'POST', body });
        toast('Invitación creada');
      }
      $('#dlg-form').close();
      load();
    } catch (err) {
      toast(err.message, 'x');
    }
  };

  $('#confirm-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      await api(`/invitaciones/${confirmingId}/responder`, {
        method: 'PATCH',
        body: { asistira: true, cuposConfirmados: Number(f.cupos.value), metodo: f.metodo.value },
      });
      $('#dlg-confirm').close();
      toast('Asistencia confirmada');
      load();
    } catch (err) {
      toast(err.message, 'x');
    }
  };

  // ---------- acciones ----------
  const marcarEnviada = async (x) => {
    if (x.enviada) return;
    await api(`/invitaciones/${x.id}/enviar`, { method: 'POST' });
    load();
  };

  const actions = {
    whatsapp(x) {
      window.open(whatsappUrl(x), '_blank', 'noopener');
      marcarEnviada(x).catch((e) => toast(e.message, 'x'));
    },
    copiarMensaje: (x) => copy(buildMensaje(x), 'Mensaje copiado'),
    copiarLink: (x) => copy(x.link, 'Link copiado'),
    ver: (x) => window.open(x.link, '_blank', 'noopener'),
    preview(x) {
      previewing = x;
      $('#preview-text').textContent = buildMensaje(x);
      $('#dlg-preview').showModal();
    },
    async marcarEnviada(x) {
      await marcarEnviada(x);
      toast('Marcada como enviada');
    },
    confirmar(x) {
      confirmingId = x.id;
      $('#confirm-who').textContent = `${x.destino} · ${plural(x.cupos, 'cupo', 'cupos')}`;
      const sel = $('#confirm-form').elements.cupos;
      sel.innerHTML = '';
      for (let i = x.cupos; i >= 1; i--) sel.add(new Option(plural(i, 'persona', 'personas'), i));
      $('#dlg-confirm').showModal();
    },
    async rechazar(x) {
      if (!confirm(`¿Marcar que ${x.destino} no asistirá?`)) return;
      await api(`/invitaciones/${x.id}/responder`, { method: 'PATCH', body: { asistira: false } });
      toast('Marcada como no asiste');
      load();
    },
    async reset(x) {
      if (!confirm(`¿Volver ${x.destino} a pendiente?`)) return;
      await api(`/invitaciones/${x.id}/reset`, { method: 'PATCH' });
      toast('Volvió a pendiente');
      load();
    },
    editar: (x) => openForm(x),
    async eliminar(x) {
      if (!confirm(`¿Eliminar la invitación de ${x.destino}? No se puede deshacer.`)) return;
      await api(`/invitaciones/${x.id}`, { method: 'DELETE' });
      toast('Invitación eliminada', 'trash');
      load();
    },
  };

  $('#preview-copy').onclick = () => copy(buildMensaje(previewing), 'Mensaje copiado');
  $('#preview-wa').onclick = () => {
    actions.whatsapp(previewing);
    $('#dlg-preview').close();
  };

  $('#rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    btn.closest('details')?.removeAttribute('open');
    const x = all.find((i) => i.id === btn.closest('tr').dataset.id);
    try {
      await actions[btn.dataset.a](x);
    } catch (err) {
      toast(err.message, 'x');
    }
  });

  // Cierra menus "..." al hacer clic afuera / abrir otro
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  // ---------- filtros ----------
  let deb;
  $('#f-q').oninput = (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      filtros.q = e.target.value.trim();
      renderTabla();
    }, 200);
  };
  $('#f-estado').onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filtros.estado = b.dataset.v;
    renderFiltros();
    renderTabla();
  };
  $('#f-enviada').onchange = (e) => {
    filtros.enviada = e.target.value;
    renderTabla();
  };
  $('#f-grupo').onchange = (e) => {
    filtros.grupo = e.target.value;
    renderTabla();
  };

  // ---------- en vivo ----------
  if (window.io) {
    io().on('invitacion:respondida', (x) => {
      if (!token) return;
      toast(`${x.destino}: ${ESTADOS[x.estado]?.label || x.estado}`, 'heart');
      load();
    });
  }

  // ---------- inicio ----------
  async function start() {
    try {
      const { data } = await api('/users/me');
      $('#admin-name').textContent = `Hola, ${data.name}`;
      $('#login').hidden = true;
      $('#panel').hidden = false;
      load();
    } catch {
      showLogin();
    }
  }

  token ? start() : showLogin();
})();
