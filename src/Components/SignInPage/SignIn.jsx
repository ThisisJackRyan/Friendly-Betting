import { useEffect, useState } from "react";
import { auth } from "../../Config/firebase-config";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {useNavigate} from "react-router-dom";
import css from "./SignIn.module.css";




const SignIn = () => {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [signInTransition, setSignInTransition] = useState(false);

    console.log(auth?.currentUser?.email)

    const singInUser = async () => {
        try{
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (err){
            console.error(err);
        }
    }

    const logOut = async () => {
        try{
            await signOut(auth)
        } catch (err){
            console.error(err);
        }
    }

    const navigate = useNavigate();
    const toCreateAccount = () => {
        navigate("/Friendly-Betting/CreateAccount");
    }


    

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSignInTransition(true);
    }, 2);

    return () => clearTimeout(timeout);
  }, []);
    

    return (
       
        <div className={`${css.signIn} ${signInTransition ? "" : css.signInTransition}`}>
            <div className={css.signInLabel}>Sign in</div>
            <input 
                type="text" 
                placeholder="Email or Number"  
                onChange={(e) => setEmail(e.target.value)}
            />
            <input 
                type="password" 
                placeholder="password" 
                id="" 
                onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={singInUser}>Sign In</button>
            <div>
                <div onClick={toCreateAccount} className={css.swapSignIn} >Don't have account? Create One!</div>
            </div>
            <br />
            <br />
            <button onClick={logOut}>Log Out</button>
        </div>
        

    )
}

export default SignIn;