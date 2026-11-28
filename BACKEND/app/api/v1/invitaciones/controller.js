import { prisma } from "../../../database.js";
import {
  ESTADOS,
  UUID_REGEX,
  parseBody,
  buildLink,
  buildMensaje,
  buildWhatsappUrl,
  withLink,
} from "./model.js";
import { responderInvitacion, getStats } from "./services.js";

// router.param: carga la invitacion en req.data
export const id = async (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) {
    return next({ message: "Invitación no encontrada", status: 404 });
  }
  try {
    const invitacion = await prisma.invitacion.findUnique({ where: { id } });
    if (!invitacion) {
      return next({ message: "Invitación no encontrada", status: 404 });
    }
    req.data = invitacion;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /invitaciones?estado=CONFIRMADO&enviada=true&q=edu&grupo=Amigos
 */
export const all = async (req, res, next) => {
  const { estado, enviada, q, grupo } = req.query;
  const where = {};

  if (estado) {
    const value = String(estado).toUpperCase();
    if (!ESTADOS.includes(value)) {
      return next({
        message: `estado debe ser uno de: ${ESTADOS.join(", ")}`,
        status: 400,
      });
    }
    where.estado = value;
  }
  if (enviada !== undefined) where.enviada = enviada === "true";
  if (grupo) where.grupo = { equals: grupo, mode: "insensitive" };
  if (q) {
    where.OR = [
      { destino: { contains: q, mode: "insensitive" } },
      { telefono: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  try {
    const data = await prisma.invitacion.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { destino: "asc" }, { id: "asc" }],
    });
    res.json({ data: data.map(withLink), meta: { total: data.length } });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  const { data, error } = parseBody(req.body);
  if (error) return next({ message: error, status: 400 });

  try {
    const invitacion = await prisma.invitacion.create({ data });
    res.status(201).json({
      data: withLink(invitacion),
      message: "Invitación creada",
    });
  } catch (error) {
    next(error);
  }
};

// POST /invitaciones/bulk  body: [{ destino, cupos, telefono }, ...]
export const createMany = async (req, res, next) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.invitaciones;
  if (!Array.isArray(items) || items.length === 0) {
    return next({ message: "Envía un arreglo de invitaciones", status: 400 });
  }

  const rows = [];
  for (const [i, item] of items.entries()) {
    const { data, error } = parseBody(item);
    if (error) return next({ message: `Fila ${i + 1}: ${error}`, status: 400 });
    rows.push(data);
  }

  try {
    const data = await prisma.$transaction(
      rows.map((row) => prisma.invitacion.create({ data: row })),
    );
    res.status(201).json({
      data: data.map(withLink),
      message: `${data.length} invitaciones creadas`,
    });
  } catch (error) {
    next(error);
  }
};

export const read = async (req, res) => {
  res.json({ data: withLink(req.data) });
};

export const update = async (req, res, next) => {
  const { data, error } = parseBody(req.body, true);
  if (error) return next({ message: error, status: 400 });

  // Si bajan los cupos por debajo de lo confirmado, se ajusta
  if (data.cupos !== undefined && req.data.cuposConfirmados > data.cupos) {
    data.cuposConfirmados = data.cupos;
  }

  try {
    const invitacion = await prisma.invitacion.update({
      where: { id: req.data.id },
      data,
    });
    res.json({ data: withLink(invitacion), message: "Invitación actualizada" });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    await prisma.invitacion.delete({ where: { id: req.data.id } });
    res.json({ data: req.data, message: "Invitación eliminada" });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /invitaciones/:id/enviar
 * Marca como enviada y devuelve el link personalizado + link de WhatsApp listo.
 */
export const enviar = async (req, res, next) => {
  try {
    const link = buildLink(req.data.id);
    const mensaje = buildMensaje(req.data, link);
    const whatsappUrl = buildWhatsappUrl(req.data, mensaje);

    const invitacion = await prisma.invitacion.update({
      where: { id: req.data.id },
      data: {
        enviada: true,
        fechaEnvio: req.data.fechaEnvio || new Date(),
      },
    });

    res.json({
      data: withLink(invitacion),
      meta: { link, mensaje, whatsappUrl },
      message: "Invitación lista para enviar",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /invitaciones/:id/enviada
 * body: { enviada: true | false } -> marca o desmarca como enviada (corregir errores)
 */
export const setEnviada = async (req, res, next) => {
  const { enviada } = req.body;
  if (typeof enviada !== "boolean") {
    return next({ message: "enviada (true/false) es requerido", status: 400 });
  }
  try {
    const invitacion = await prisma.invitacion.update({
      where: { id: req.data.id },
      data: {
        enviada,
        fechaEnvio: enviada ? req.data.fechaEnvio || new Date() : null,
      },
    });
    res.json({
      data: withLink(invitacion),
      message: enviada ? "Marcada como enviada" : "Marcada como no enviada",
    });
  } catch (error) {
    next(error);
  }
};

// GET /invitaciones/:id/link -> solo genera link (no marca como enviada)
export const link = async (req, res) => {
  const link = buildLink(req.data.id);
  const mensaje = buildMensaje(req.data, link);
  res.json({
    data: { link, mensaje, whatsappUrl: buildWhatsappUrl(req.data, mensaje) },
  });
};

/**
 * PATCH /invitaciones/:id/responder  (admin confirma manualmente)
 * body: { asistira: true, cuposConfirmados: 2, metodo: "WHATSAPP" | "LLAMADA" | "MANUAL" }
 */
export const responder = async (req, res, next) => {
  try {
    const invitacion = await responderInvitacion(req.data, req.body, "MANUAL");
    req.app.get("io")?.emit("invitacion:respondida", withLink(invitacion));
    res.json({ data: withLink(invitacion), message: "Respuesta registrada" });
  } catch (error) {
    next(error);
  }
};

// PATCH /invitaciones/:id/reset -> vuelve a PENDIENTE
export const reset = async (req, res, next) => {
  try {
    const invitacion = await prisma.invitacion.update({
      where: { id: req.data.id },
      data: {
        estado: "PENDIENTE",
        cuposConfirmados: 0,
        metodoConfirmacion: null,
        fechaRespuesta: null,
        mensaje: null,
      },
    });
    res.json({ data: withLink(invitacion), message: "Invitación reiniciada" });
  } catch (error) {
    next(error);
  }
};

export const stats = async (req, res, next) => {
  try {
    res.json({ data: await getStats() });
  } catch (error) {
    next(error);
  }
};
