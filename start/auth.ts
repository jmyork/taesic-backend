import router from "@adonisjs/core/services/router";
import { middleware } from "./kernel.js";


router.resource('auth/user','#controllers/users_controller').apiOnly()
router.post('auth/login','#controllers/users_controller.login')
router.post('auth/logout','#controllers/users_controller.logout').use(middleware.auth())

