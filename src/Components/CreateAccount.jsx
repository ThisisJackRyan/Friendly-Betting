import { Link } from "react-router-dom";
import { useEffect, useState } from "react";






const CreateAccount = () => {

    const [signInTransition, setSignInTransition] = useState(false);


useEffect(() => {
    const timeout = setTimeout(() => {
      setSignInTransition(true);
    }, 2);

    return () => clearTimeout(timeout);
  }, []);
    return (
        <div className={`signIn ${signInTransition ? "" : "signInTransition"}`}>
            <div className="signInLabel">Create Account</div>
            <input type="text" placeholder="Email" />
            <input type="text" placeholder="Phone" />
            <br />
            <input type="password" placeholder="password" name="" id="" />
            <input type="password" placeholder="confirm password" name="" id="" />
            <button>Create Account</button>
            <div>
                <Link to="/SignIn" className="swapSignIn" >Already have account? Sign in!</Link>
            </div>
        </div>
    )
}

export default CreateAccount;