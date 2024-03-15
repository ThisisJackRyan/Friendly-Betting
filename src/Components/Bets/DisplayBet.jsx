import React, {useEffect, useState} from 'react';
import css from './Bets.module.css';
import {Link} from 'react-router-dom';
import {getCollectionName} from '../../Config/base';



const DisplayBet = (props) => {

    const [betType, setBetType] = useState('')

    useEffect(() => {
        setBetType(getCollectionName(props.bet.type));
    }, [])
    return (
        <div>
            <Link 
                to={`/Friendly-Betting/Bet/${betType}/${props.bet.id}/`}
                state={{"bet":props.bet}}
                className="text-black no-underline"
            
            >
                <div className={`box-shadow bg-spring-green-light rounded-2xl p-4 m-2 ${css.bet}`} key={props.bet.id}>
                    <p>{props.bet.type}</p>
                    <h4>{props.bet.bet}</h4>
                </div>
            </Link>
        </div>
    );
}

export default DisplayBet;