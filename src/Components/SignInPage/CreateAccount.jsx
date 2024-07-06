import { useNavigate } from "react-router-dom";
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

        <div>
            <form onSubmit={createAccount}>
            <div className='flex justify-center items-center p-4 bg-spring-green-light m-4 rounded-md'>
                <span className='text-3xl'>Create Account</span>     
            </div>
            <div className="m-12 mt-32 flex flex-col gap-4">
                <input type="text"
                    placeholder="Email" 
                    id="username"
                    className="border-blue-gray rounded-md w-full outline-none p-4 focus:border-black"
                    onChange={(e) => setEmail(e.target.value)} 
                />
                <input 
                    type="password" 
                    placeholder="password" 
                    name=""
                    id="password1" 
                    className="border-blue-gray rounded-md w-full outline-none p-4 focus:border-black"
                    onChange={(e) => setPassword1(e.target.value)}
                />
                <input 
                    type="password"
                    placeholder="confirm password" 
                    name="" 
                    id="password2" 
                    className="border-blue-gray rounded-md w-full outline-none p-4 focus:border-black"
                    onChange={(e) => setPassword2(e.target.value)}
                />
                <div className='flex justify-center mt-6'>
                    <button className='betButton rounded-md cursor-pointer ' type='submit'>Create Account</button>
                </div>
                <div className="flex justify-center">
                    <span onClick={toSignIn} className="blue underline text-xs" >Already have account? Sign in!</span>
                </div>
            </div>

            </form>
        </div>
        
    )
}

export default CreateAccount;