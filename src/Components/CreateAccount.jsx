import { Link } from "react-router-dom";




const CreateAccount = () => {
    return (
        <div className="signIn">
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