const { Addcontact, Getcontact, DeleteContact, RetryContactSheetSync } = require("../controllers/contactController");

const router = require("express").Router();
const { verifyToken } = require("../middleware/authenticate");

router.post("/contact/add", Addcontact);

router.get("/contact/get", verifyToken, Getcontact);
router.delete("/contact/delete/:id", verifyToken, DeleteContact);
router.post("/contact/sync/:id", verifyToken, RetryContactSheetSync);

module.exports = router;
