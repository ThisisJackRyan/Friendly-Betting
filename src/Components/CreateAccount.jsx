import SignIn from "./SignIn";



const CreateAccount = () => {
    return (
        <div className="signIn">
            <div className="signInLabel">Sign in</div>
            <input type="text" placeholder="Email or Number" />
            <input type="password" placeholder="password" name="" id="" />
            <div>
                <a href={SignIn}>Already have account? Sign in!</a>
            </div>
        </div>
    )
}

export default CreateAccount;