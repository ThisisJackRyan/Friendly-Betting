



const CreateAccount = (props) => {
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
                <div className="swapSignIn" onClick={props.swap}>Already have account? Sign in!</div>
            </div>
        </div>
    )
}

export default CreateAccount;