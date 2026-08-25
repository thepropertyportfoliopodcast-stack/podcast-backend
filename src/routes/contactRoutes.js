const { Addcontact, Getcontact, DeleteContact, RetryContactSheetSync } = require("../controllers/contactController");

const router = require("express").Router();
const { verifyToken, requirePermission } = require("../middleware/authenticate");
const { ADMIN_PERMISSIONS } = require("../config/adminPermissions");

router.post("/contact/add", Addcontact);

router.get("/contact/get", verifyToken, requirePermission(ADMIN_PERMISSIONS.ENQUIRIES), Getcontact);
router.delete("/contact/delete/:id", verifyToken, requirePermission(ADMIN_PERMISSIONS.ENQUIRIES), DeleteContact);
router.post("/contact/sync/:id", verifyToken, requirePermission(ADMIN_PERMISSIONS.ENQUIRIES), RetryContactSheetSync);

module.exports = router;
