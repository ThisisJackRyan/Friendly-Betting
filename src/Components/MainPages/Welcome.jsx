import React from 'react';
import SignIn from '../SignIn';
import CreateAccount from '../CreateAccount';
import { useState } from 'react';  

const Welcome = () => {

    const [signUp, setSignUp] = useState(true);

    const toggleForm = () => {
        setSignUp((current) => !current)
      }
    return (
        <div>
            <div>Hello</div>
            {
              //signUp ? <SignIn swap = {toggleForm}/> :<CreateAccount swap = {toggleForm} />
            }
        </div>
    );
};

export default Welcome;