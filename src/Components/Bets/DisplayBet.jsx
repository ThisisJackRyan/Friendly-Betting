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
                className={css.link}
            
            >
                <div className={css.bet} key={props.bet.id}>
                    <h4>{props.bet.type}</h4>
                    <p>{props.bet.bet}</p>
                </div>
            </Link>
        </div>
    );
}

export default DisplayBet;