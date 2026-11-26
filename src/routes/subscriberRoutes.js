const { AddSubscriber, SubscriberGet, DeleteSubscriber } = require("../controllers/subscriberController");
const router =  require("express").Router();
const { verifyToken, requirePermission } = require("../middleware/authenticate");
const { ADMIN_PERMISSIONS } = require("../config/adminPermissions");

router.post("/subscriber/add" ,  AddSubscriber);
router.get("/Subscriber/get", verifyToken, requirePermission(ADMIN_PERMISSIONS.SUBSCRIBERS), SubscriberGet);
router.delete("/subscriber/delete/:id", verifyToken, requirePermission(ADMIN_PERMISSIONS.SUBSCRIBERS), DeleteSubscriber);

module.exports = router ;
