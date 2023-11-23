



const SignIn = (props) => {
    return (
        <div className="signIn">
            <div className="signInLabel">Sign in</div>
            <input type="text" placeholder="Email or Number" />
            <input type="password" placeholder="password" name="" id="" />
            <button>Sign In</button>
            <div>
                <div className="swapSignIn" onClick={props.swap}>Don't have account? Create One!</div>
            </div>
        </div>
    )
}

export default SignIn;