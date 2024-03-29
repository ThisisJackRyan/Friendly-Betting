import React from 'react';
import { useState, useEffect } from 'react';  
import { auth } from "../Config/firebase-config";
import { Link } from "react-router-dom";



const Welcome = () => {

    const [signedIn, setSignedIn] = useState(true);

    console.log(auth?.currentUser?.email)

    useEffect(() => {
        isAuthenticated();
    }, []);

    const isAuthenticated = () => {
        const currentUserEmail = auth?.currentUser?.email;
        const isAuthenticated = currentUserEmail !== undefined;
        setSignedIn(isAuthenticated);
    };

    return (
    <div className='p-12'>
        {signedIn ? (
        <div>
            
            {/* Render the authenticated content */}
            <h1>Welcome, User!</h1>
            <p>This is the authenticated content.</p>
        </div>
        ) : (
        <div>
            {/* Render the non-authenticated content */}
            <h1>Please sign in to access this content.</h1>
            <Link className="Link" to="/SignIn">Sign In</Link>
        </div>
        )}
            <Link className="Link" to="SignIn">Sign In</Link>

    </div>
    
    );
};

export default Welcome;