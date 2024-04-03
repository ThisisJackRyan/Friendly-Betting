import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isUserSignedIn } from '../../Config/base';

const CreateBet = () => {
    // Your component logic goes here
    const navigate = useNavigate();

    useEffect(() => {
        if(!isUserSignedIn()){
            alert("You must be signed in to create a bet")
            navigate(`/Friendly-Betting/Bet`)
        }
    }, [])

    return (
        <div>
            whatt
        </div>
    );
};

export default CreateBet;