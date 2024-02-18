import { Link, useNavigate} from "react-router-dom";
import { auth } from "../../Config/firebase-config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useEffect, useState} from "react";

import css from "./SignIn.module.css";





const CreateAccount = () => {
    
    const navigate = useNavigate();

    const [signInTransition, setSignInTransition] = useState(false);
    const [email, setEmail] = useState("");
    const [password1, setPassword1] = useState("");
    const [password2, setPassword2] = useState("");

    const toSignIn = () => {
        navigate("/Friendly-Betting/SignIn");
    }

    const createAccount = async () => {
       
        if(password1 !== password2){
            console.error("Passwords do not match")
            return;
        }
        await createUserWithEmailAndPassword(auth, email, password1)
        .then((userCredential) => {
            // Signed up 
            const user = userCredential.user;
            console.log("User created")
            console.log(user);
            navigate("/Friendly-Betting/");
            
            // ...
            })
            .catch((error) => {
            const errorMessage = error.message;
            console.log(errorMessage)
            // ..
            });
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
            <input type="text"
                placeholder="Email" 
                onChange={(e) => setEmail(e.target.value)} 
            />
            <br />
            <input 
                type="password" 
                placeholder="password" 
                name=""
                id="password1" 
                onChange={(e) => setPassword1(e.target.value)}
            />
            <input 
                type="password"
                placeholder="confirm password" 
                name="" 
                id="" 
                onChange={(e) => setPassword2(e.target.value)}
             />
            <button onClick={createAccount}>Create Account</button>
            <div>
                <div onClick={toSignIn} className={css.swapSignIn} >Already have account? Sign in!</div>
            </div>
        </div>
    )
}

export default CreateAccount;