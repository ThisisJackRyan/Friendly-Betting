import React from 'react';
import css from './Components.module.css';
import { Link } from 'react-router-dom';

const EditButton = (props) => {

    return (
        <div className='flex justify-center items-center'>
            <Link 
                to={`/Friendly-Betting/Bet/${props.collectionName}/${props.betUrl.id}/edit`}
                state={{
                    "betUrl":props.betUrl,
                    "bets": props.bets,
                }}
                className="text-black no-underline"
            >
                <button className={css.EditButton} >Edit</button>
            </Link>
        </div>
    );
};

export default EditButton;