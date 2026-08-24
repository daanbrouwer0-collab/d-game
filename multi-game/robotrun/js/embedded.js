import { stubEmbeddedAdapter, runEmbeddedGame } from "../js/bridge/embedded-bootstrap.js";

runEmbeddedGame(
  stubEmbeddedAdapter({ gameId: "robotrun", title: "RobotRun" }),
);
