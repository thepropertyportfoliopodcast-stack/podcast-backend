const { signup, login, GetUser, Dashboard } = require("../controllers/userController");
const { verifyToken, requirePermission } = require("../middleware/authenticate");
const { ADMIN_PERMISSIONS } = require("../config/adminPermissions");

const router = require("express").Router();

router.post("/user/login", login);
router.get("/user/profile", verifyToken, GetUser);
router.get("/user/dashboard", verifyToken, requirePermission(ADMIN_PERMISSIONS.DASHBOARD), Dashboard);

module.exports = router;
