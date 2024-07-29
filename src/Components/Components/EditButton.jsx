import React from 'react';
import css from './Components.module.css';
import { Link } from 'react-router-dom';

const EditButton = ({betUrl, bets, collectionName}) => {

    return (
        <div className='flex justify-center items-center'>
            <Link 
                to={`/Friendly-Betting/Bet/${collectionName}/${betUrl.id}/edit`}
                state={{
                    "betUrl":betUrl,
                    "bets": bets,
                }}
                className="text-black w-full no-underline"
            >
                <button className={css.EditButton} >Edit</button>
            </Link>
        </div>
    );
};

export default EditButton;