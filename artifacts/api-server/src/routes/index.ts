import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import datasetsRouter from "./datasets";
import questionsRouter from "./questions";
import responsesRouter from "./responses";
import evaluationsRouter from "./evaluations";
import analyticsRouter from "./analytics";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(datasetsRouter);
router.use(questionsRouter);
router.use(responsesRouter);
router.use(evaluationsRouter);
router.use(analyticsRouter);
router.use(settingsRouter);

export default router;
