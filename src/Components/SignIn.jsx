import { useState } from "react";
import { auth } from "../Config/firebase-config";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";



const SignIn = (props) => {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

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


    return (
        <div className="signIn">
            <div className="signInLabel">Sign in</div>
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
                <div className="swapSignIn" onClick={props.swap}>Don't have account? Create One!</div>
            </div>
            <br />
            <br />
            <button onClick={logOut}>Log Out</button>
        </div>
    )
}

export default SignIn;