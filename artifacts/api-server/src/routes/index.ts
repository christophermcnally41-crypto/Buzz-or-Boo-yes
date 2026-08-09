import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import marketsRouter from "./markets";
import predictionsRouter from "./predictions";
import usersRouter from "./users";
import leaderboardRouter from "./leaderboard";
import adminRouter from "./admin";
import pollsRouter from "./polls";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(marketsRouter);
router.use(predictionsRouter);
router.use(usersRouter);
router.use(leaderboardRouter);
router.use(adminRouter);
router.use(pollsRouter);

export default router;
