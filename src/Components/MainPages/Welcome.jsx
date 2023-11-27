import React from 'react';
import { useState } from 'react';  

const Welcome = () => {

    const [signUp, setSignUp] = useState(true);

    const toggleForm = () => {
        setSignUp((current) => !current)
      }
    return (
        <div>
            <div>Hello</div>
        </div>
    );
};

export default Welcome;