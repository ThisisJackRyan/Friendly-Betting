import { Link, useNavigate} from "react-router-dom";
import { useEffect, useState} from "react";

import css from "./SignIn.module.css";





const CreateAccount = () => {

    const [signInTransition, setSignInTransition] = useState(false);
    const navigate = useNavigate();
    const toSignIn = () => {
        navigate("/Friendly-Betting/SignIn");
    }

useEffect(() => {
    const timeout = setTimeout(() => {
      setSignInTransition(true);
    }, 2);

    return () => clearTimeout(timeout);
  }, []);
    return (
        <div className={`${css.signIn} ${signInTransition ? "" : css.signInTransition}`}>
            <div className={css.signInLabel}>Create Account</div>
            <input type="text" placeholder="Email" />
            <input type="text" placeholder="Phone" />
            <br />
            <input type="password" placeholder="password" name="" id="" />
            <input type="password" placeholder="confirm password" name="" id="" />
            <button>Create Account</button>
            <div>
                <div onClick={toSignIn} className={css.swapSignIn} >Already have account? Sign in!</div>
            </div>
        </div>
    )
}

export default CreateAccount;