import React from 'react';
import css from './Components.module.css';
import {db} from '../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from "firebase/storage";


const DeleteButton = () => {
    const handleDelete = () => {
        // Add your delete logic here
    };

    return (
        <div className='flex justify-center items-center'>
            <button className={css.DeleteButton}onClick={handleDelete}>
            Delete
            </button>
        </div>
    );
};

export default DeleteButton;
