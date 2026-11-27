import { prisma } from "../../../database.js";
import {
  UUID_REGEX,
  publicSelect,
  toPublic,
  withLink,
} from "../invitaciones/model.js";
import { responderInvitacion } from "../invitaciones/services.js";

export const id = async (req, res, next, id) => {
  if (!UUID_REGEX.test(id)) {
    return next({ message: "Invitación no válida", status: 404 });
  }
  try {
    const invitacion = await prisma.invitacion.findUnique({ where: { id } });
    if (!invitacion) {
      return next({ message: "Invitación no válida", status: 404 });
    }
    req.data = invitacion;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /public/invitaciones/:id
 * Lo que carga el front al abrir el link. Suma una vista.
 */
export const read = async (req, res, next) => {
  try {
    const data = await prisma.invitacion.update({
      where: { id: req.data.id },
      data: { vistas: { increment: 1 }, ultimaVista: new Date() },
      select: publicSelect,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /public/invitaciones/:id/responder
 * body: { asistira: true|false, cuposConfirmados?: number, mensaje?: string, metodo?: "WEB"|"WHATSAPP" }
 */
export const responder = async (req, res, next) => {
  const metodo = req.body?.metodo || "WEB";
  if (!["WEB", "WHATSAPP"].includes(metodo)) {
    return next({ message: "metodo debe ser WEB o WHATSAPP", status: 400 });
  }

  try {
    const invitacion = await responderInvitacion(req.data, {
      ...req.body,
      metodo,
    });

    // Aviso en vivo al panel admin
    req.app.get("io")?.emit("invitacion:respondida", withLink(invitacion));

    res.json({
      data: toPublic(invitacion),
      message:
        invitacion.estado === "CONFIRMADO"
          ? "¡Gracias por confirmar tu asistencia!"
          : "Gracias por avisarnos, te extrañaremos",
    });
  } catch (error) {
    next(error);
  }
};
