import React from 'react';
import SignIn from '../SignIn';
import CreateAccount from '../CreateAccount';
import { useState } from 'react';  
const Format = () => {

    const [signUp, setSignUp] = useState(true);

    const toggleForm = () => {
        setSignUp((current) => !current)
      }
    return (
        <div>
            {
              signUp ? <SignIn swap = {toggleForm}/> :<CreateAccount swap = {toggleForm} />
            }
        </div>
    );
};

export default Format;