import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import modelsRouter from "./models";
import datasetsRouter from "./datasets";
import questionsRouter from "./questions";
import responsesRouter from "./responses";
import evaluationsRouter from "./evaluations";
import analyticsRouter from "./analytics";
import settingsRouter from "./settings";
import referenceAnswersRouter from "./reference-answers";
import activityLogRouter from "./activity-log";
import promptsRouter from "./prompts";
import humanEvaluationsRouter from "./human-evaluations";
import responseFlagsRouter from "./response-flags";
import adminRouter from "./admin";

const router: IRouter = Router();

// Public auth routes (no session required)
router.use(authRouter);
router.use(healthRouter);

// Global auth guard — all routes below this point require a valid session
const UNPROTECTED = ["/settings/judge-models", "/auth/firebase-session", "/auth/firebase-logout"];

router.use((req: Request, res: Response, next: NextFunction) => {
  if (UNPROTECTED.some((p) => req.path === p)) return next();
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

router.use(modelsRouter);
router.use(datasetsRouter);
router.use(questionsRouter);
router.use(responsesRouter);
router.use(evaluationsRouter);
router.use(analyticsRouter);
router.use(settingsRouter);
router.use(referenceAnswersRouter);
router.use(activityLogRouter);
router.use(promptsRouter);
router.use(humanEvaluationsRouter);
router.use(responseFlagsRouter);
router.use(adminRouter);

export default router;
