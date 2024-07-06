import { useEffect, useState } from "react";
import { auth } from "../../Config/firebase-config";
import { signInWithEmailAndPassword, signOut,  } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import css from "./SignIn.module.css";




const SignIn = () => {

    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [signInTransition, setSignInTransition] = useState(false);


    console.log(auth?.currentUser?.email)

    const signInUser = async () => {
        signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Signed in 
            const user = userCredential.user;
            console.log("User signed in")
            console.log(user);
            navigate("/Friendly-Betting/");
        })
        .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        console.error("ERROR --> " + errorCode)
        console.error(errorMessage)
        });
         
    }

    const logOut = async () => {
        try{
            await signOut(auth)
        } catch (err){
            console.error(err);
        }
    }

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

        <div>
            <form onSubmit={signInUser}>
            <div className='flex justify-center items-center p-4 bg-spring-green-light m-4 rounded-md'>
                <span className='text-3xl'>Sign in</span>     
            </div>
            <div className="m-12 mt-32 flex flex-col gap-4">
                <input 
                    type="text" 
                    placeholder="Email or Number"  
                    id="username"
                    className="border-blue-gray rounded-md w-full outline-none p-4 focus:border-black"
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input 
                    type="password"
                    placeholder="password"
                    id="password"
                    className="border-blue-gray rounded-md w-full outline-none p-4 focus:border-black"
                    onChange={(e) => setPassword(e.target.value)}
                     />

                <div className='flex justify-center mt-6'>
                    <button className='betButton  rounded-md cursor-pointer ' type='submit'>Sign in</button>
                </div>
                <div className="flex justify-center">
                    <span onClick={toCreateAccount} className="blue underline text-xs" >Don't have account? Create One!</span>
                </div>
            </div>
            </form>
            <div className="flex justify-center mb-4">
                <span className="">or</span>
            </div>

            <div className='flex justify-center mt-6'>
                <button className='betButton  rounded-md cursor-pointer ' onClick={logOut}>Log Out</button>
            </div>
        </div>
        

    )
}

export default SignIn;