import { Router } from "express";
import * as controller from "./controller.js";
import { auth } from "../auth.js";

// eslint-disable-next-line new-cap
export const router = Router();

/**
 * (ADMIN - requiere Bearer token)
 * /api/v1/invitaciones                GET    - listar (?estado=&enviada=&q=&grupo=)
 * /api/v1/invitaciones                POST   - crear
 * /api/v1/invitaciones/bulk           POST   - crear varias
 * /api/v1/invitaciones/stats          GET    - resumen confirmados / pendientes
 * /api/v1/invitaciones/:id            GET | PUT | PATCH | DELETE
 * /api/v1/invitaciones/:id/enviar     POST   - marca enviada + link + whatsappUrl
 * /api/v1/invitaciones/:id/enviada    PATCH  - { enviada: true|false } marcar / desmarcar
 * /api/v1/invitaciones/:id/link       GET    - solo link (no marca enviada)
 * /api/v1/invitaciones/:id/responder  PATCH  - confirmar / rechazar manual
 * /api/v1/invitaciones/:id/reset      PATCH  - volver a PENDIENTE
 */
router.use(auth);

router.route("/").get(controller.all).post(controller.create);
router.route("/bulk").post(controller.createMany);
router.route("/stats").get(controller.stats);

router.param("id", controller.id);

router
  .route("/:id")
  .get(controller.read)
  .put(controller.update)
  .patch(controller.update)
  .delete(controller.remove);

router.route("/:id/enviar").post(controller.enviar);
router.route("/:id/enviada").patch(controller.setEnviada);
router.route("/:id/link").get(controller.link);
router.route("/:id/responder").patch(controller.responder);
router.route("/:id/reset").patch(controller.reset);
