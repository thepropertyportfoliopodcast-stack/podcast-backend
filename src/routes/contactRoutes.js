const { Addcontact, Getcontact, DeleteContact } = require("../controllers/contactController");

const router = require("express").Router();
const { verifyToken } = require("../middleware/authenticate");

router.post("/contact/add", Addcontact);

router.get("/contact/get", verifyToken, Getcontact);
router.delete("/contact/delete/:id", verifyToken, DeleteContact);

module.exports = router;
