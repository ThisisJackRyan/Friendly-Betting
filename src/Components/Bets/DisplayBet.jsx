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
        <div className='max-w-3xl'>
            <Link 
                to={`/Friendly-Betting/Bet/${betType}/${props.bet.id}/`}
                state={{"bet":props.bet}}
                className="text-black no-underline"
            
            >
                <div className="flex justify-between box-shadow bg-spring-green-light rounded-2xl p-4 m-4">
                    <div className="flex flex-col gap-6 max-w-sm"key={props.bet.id}>
                        <div>{props.bet.type}</div>
                        <div className='text-2xl font-bold text-center pl-8'>{props.bet.bet}</div>
                        <div className='text-lg pl-8'>Line 13.5</div>
                        <div className='text-sm pl-8'>Created by <span className='font-semibold'>{props.bet.createdByEmail}</span></div>
                    </div>
                    <div className=''>
                        <div className={`flex`}>
                            <div className={`flex flex-col p-2 m-2  ${css.line}`}>
                                <div className='flex  justify-center items-center p-4 font-semibold'>Chiefs</div>
                                <div className='flex justify-center items-center p-4 pb-0 font-light'> 27 Bets</div>
                            </div>
                            <div className='flex flex-col p-2 m-2'>
                                <div className='flex justify-center items-center p-4 font-semibold'>Chargers</div>
                                <div className='flex justify-center items-center p-4 pb-0 font-light'>23 Bets</div>
                            </div>
                        </div>
                        <div className='flex justify-center items-center p-4 font-light'>50 Bets placed</div>
                    </div>
                </div>
            </Link>
        </div>
    );
}

export default DisplayBet;